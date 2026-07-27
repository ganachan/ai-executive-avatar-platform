"""
Voice Live API proxy router.

Browser WebSocket connections cannot send custom Authorization headers, so this
proxy bridges the browser ↔ Voice Live API gap:

  Browser  ←WS→  /api/voice-live/ws?avatar_id=X  ←WS→  Voice Live API
                 (FastAPI, uses Entra ID Bearer)

The proxy:
  1. Looks up the avatar (character, style, voice, system_prompt).
  2. Opens an authenticated WebSocket to the Voice Live API endpoint.
  3. Sends an initial session.update that configures voice, instructions, avatar,
     and enhanced turn-detection.
  4. Bidirectionally forwards all subsequent messages between browser and API.

Avatar video (WebRTC) SDP exchange:
  The browser creates an RTCPeerConnection for avatar video, generates a local
  SDP offer, and sends { type: "session.avatar.connect", client_sdp: "..." }.
  The proxy forwards it transparently; the API replies with
  { type: "session.avatar.connecting", server_sdp: "..." } which the browser
  then applies to its RTCPeerConnection.

Audio I/O:
  - Browser → API : { type: "input_audio_buffer.append", audio: "<base64 PCM16>" }
  - API → Browser : { type: "response.audio.delta",      delta: "<base64 PCM16>" }
"""

import asyncio
import json
import logging
import collections
import threading
from typing import List, Dict, Any
from datetime import datetime, timezone

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException

from azure.identity.aio import DefaultAzureCredential
from config import settings
from routers.avatars import AVATARS

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Debug message ring-buffer (last 500 non-audio messages across all sessions) ─
_trace_lock = threading.Lock()
_trace_buf: collections.deque = collections.deque(maxlen=500)

# Message types excluded from the ring-buffer (too noisy; audio frames flood it)
_TRACE_SKIP = {"input_audio_buffer.append", "response.audio.delta"}

def _trace(direction: str, msg_type: str, payload: Any) -> None:
    """Append one message to the in-memory trace ring-buffer (audio skipped)."""
    if msg_type in _TRACE_SKIP:
        return
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "dir": direction,   # "B→A" (browser→api) or "A→B" (api→browser)
        "type": msg_type,
        "payload": payload,
    }
    with _trace_lock:
        _trace_buf.append(entry)
    logger.warning("[TRACE %s] %s | %s", direction, msg_type,
                   json.dumps(payload)[:600])

# Voice Live API WebSocket endpoint.
# Uses the AI Foundry / services.ai.azure.com hostname (recommended for new resources).
VOICE_LIVE_WS_PATH = "/voice-live/realtime?api-version=2025-10-01"

_credential: DefaultAzureCredential | None = None


async def _get_bearer_token() -> str:
    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential()
    token = await _credential.get_token("https://cognitiveservices.azure.com/.default")
    return token.token


def _build_session_update(avatar: object) -> dict:
    """
    Build the initial session.update payload for the Voice Live API.

    We do NOT include ice_servers. Per the official docs, when ice_servers is
    omitted the API returns its own TURN credentials in session.updated →
    session.avatar.ice_servers. The browser uses those to create the
    RTCPeerConnection and generate local ICE candidates before sending
    session.avatar.connect.
    """
    # Prepend a voice-mode context so the model never claims it lacks audio
    # capabilities (the base model can be confused about its interface).
    voice_prefix = (
        "You are operating as a real-time voice AI assistant with a full-body video avatar. "
        "You CAN hear the user through their microphone and you speak directly to them. "
        "You DO have a visible video avatar that the user can see and interact with. "
        "Never say you lack audio, voice, hearing, or video/visual capabilities. "
        "Respond conversationally and concisely as if on a live video call. "
    )
    instructions = voice_prefix + getattr(avatar, "system_prompt", "")
    update: dict = {
        "type": "session.update",
        "session": {
            "instructions": instructions,
            "modalities": ["text", "audio"],
            "voice": {
                "name": avatar.voice_name,  # type: ignore[attr-defined]
                "type": "azure-standard",
            },
            "turn_detection": {
                "type": "azure_semantic_vad",
                "silence_duration_ms": 500,
                "interrupt_response": True,
            },
            "input_audio_noise_reduction": {"type": "azure_deep_noise_suppression"},
            "input_audio_echo_cancellation": {"type": "server_echo_cancellation"},
            "input_audio_transcription": {"model": "azure-speech", "language": "en"},
        },
    }

    # Add avatar config when the avatar is a stock avatar.
    # Photo avatars use a different flow (VASA-1); skip avatar block for them.
    character = getattr(avatar, "avatar_character", None)
    style = getattr(avatar, "avatar_style", None)
    avatar_type = getattr(avatar, "avatar_type", "stock")

    if avatar_type == "stock" and character:
        avatar_block: dict = {
            "character": character,
            "customized": False,
            "video": {
                "bitrate": 2000000,
                "codec": "h264",
                # Crop 800×1080 window from 1920×1080 source (official sample)
                "crop": {
                    "top_left": [560, 0],
                    "bottom_right": [1360, 1080],
                },
                "resolution": {
                    "width": 800,
                    "height": 1080,
                },
                "background": {"color": "#0f1117FF"},
            },
        }
        if style:
            avatar_block["style"] = style
        update["session"]["avatar"] = avatar_block
        logger.info("session.update avatar block: character=%s style=%s", character, style)

    elif avatar_type == "custom" and character:
        # Custom (trained) avatars: customized=True, no style field.
        # Resolution must be the model's native 1920×1080 (16:9). Sending a
        # different resolution or a crop that changes the ratio causes a 400.
        # gop_size=10 improves lip-sync for WebRTC by inserting keyframes every ~333ms.
        is_customized = getattr(avatar, "customized", True)
        avatar_block = {
            "character": character,
            "customized": is_customized,
            "video": {
                "bitrate": 2000000,
                "codec": "h264",
                "resolution": {
                    "width": 1920,
                    "height": 1080,
                },
                "gop_size": 10,
                "background": {"color": "#0f1117FF"},
            },
        }
        update["session"]["avatar"] = avatar_block
        logger.info("session.update custom avatar block: character=%s customized=%s", character, is_customized)

    return update


@router.get("/debug/trace")
def get_trace():
    """Return the last N traced messages for debugging."""
    with _trace_lock:
        return list(_trace_buf)


@router.get("/debug/clear")
def clear_trace():
    with _trace_lock:
        _trace_buf.clear()
    return {"status": "cleared"}


@router.websocket("/ws")
async def voice_live_ws(
    ws: WebSocket,
    avatar_id: str = Query(..., description="Avatar ID to use for this session"),
):
    """
    WebSocket proxy for the Voice Live API.

    Query params:
      avatar_id  — ID of the avatar profile to use (character, style, voice, prompt)
    """
    avatar = AVATARS.get(avatar_id)
    if not avatar:
        await ws.close(code=4404, reason=f"Avatar '{avatar_id}' not found")
        return

    await ws.accept()

    avatar_type = getattr(avatar, "avatar_type", "stock")

    # All avatar types (stock and custom) use the same Voice Live / OpenAI Realtime
    # endpoint with Entra ID bearer token. The custom avatar is differentiated only
    # by the session.update payload (customized=true, no style field).
    # Note: westus2.tts.speech.microsoft.com shown in the Azure portal is the
    # batch TTS synthesis endpoint — NOT the Voice Live real-time API.
    endpoint = (settings.VOICE_LIVE_ENDPOINT or settings.AZURE_OPENAI_ENDPOINT).rstrip("/")
    if not endpoint:
        await ws.send_text(json.dumps({
            "type": "error",
            "error": {"message": "VOICE_LIVE_ENDPOINT (or AZURE_OPENAI_ENDPOINT) is not configured on the server."},
        }))
        await ws.close(code=4500)
        return
    model = settings.VOICE_LIVE_MODEL or "gpt-4o"
    vl_url = endpoint.replace("https://", "wss://").replace("http://", "ws://")
    vl_url = f"{vl_url}{VOICE_LIVE_WS_PATH}&model={model}"

    try:
        bearer_token = await _get_bearer_token()
    except Exception as exc:
        logger.error("Failed to obtain Bearer token: %s", exc)
        await ws.send_text(json.dumps({
            "type": "error",
            "error": {"message": f"Auth error: {exc}"},
        }))
        await ws.close(code=4401)
        return
    ws_headers = {"Authorization": f"Bearer {bearer_token}"}

    logger.info("Connecting to Voice Live API: %s", vl_url)

    try:
        vl_ws = await websockets.connect(
            vl_url,
            additional_headers=ws_headers,
            open_timeout=15,
        )
    except Exception as exc:
        logger.error("Could not connect to Voice Live API: %s", exc)
        await ws.send_text(json.dumps({
            "type": "error",
            "error": {"message": f"Voice Live API connection failed: {exc}"},
        }))
        await ws.close(code=4502)
        return

    async def browser_to_api():
        """
        Forward messages from the browser to the Voice Live API.
        """
        session_update_sent = False

        try:
            async for raw in ws.iter_text():
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                msg_type = msg.get("type", "")
                _trace("B→A", msg_type, msg if msg_type != "input_audio_buffer.append" else {"type": msg_type})

                if msg_type == "voice_live.init":
                    if not session_update_sent:
                        su = _build_session_update(avatar)
                        _trace("B→A(proxy)", "session.update", su)
                        await vl_ws.send(json.dumps(su))
                        session_update_sent = True
                    continue

                if not session_update_sent:
                    su = _build_session_update(avatar)
                    _trace("B→A(proxy)", "session.update", su)
                    await vl_ws.send(json.dumps(su))
                    session_update_sent = True

                await vl_ws.send(raw)

        except WebSocketDisconnect:
            pass
        except Exception as exc:
            logger.warning("browser_to_api error: %s", exc)
        finally:
            await vl_ws.close()

    async def api_to_browser():
        """Forward messages from the Voice Live API back to the browser."""
        try:
            async for raw in vl_ws:
                try:
                    if isinstance(raw, bytes):
                        await ws.send_bytes(raw)
                    else:
                        try:
                            evt = json.loads(raw)
                            evt_type = evt.get("type", "")
                            # Skip audio deltas — trace everything else in full
                            if evt_type not in _TRACE_SKIP:
                                _trace("A→B", evt_type, evt)
                        except Exception:
                            pass
                        await ws.send_text(raw)
                except Exception:
                    break
        except Exception as exc:
            logger.warning("api_to_browser error: %s", exc)
        finally:
            try:
                await ws.close()
            except Exception:
                pass

    # Run both directions concurrently; cancel both when either finishes
    tasks = [
        asyncio.create_task(browser_to_api()),
        asyncio.create_task(api_to_browser()),
    ]
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for t in pending:
        t.cancel()
    for t in done:
        exc = t.exception()
        if exc:
            logger.warning("voice_live_ws task raised: %s", exc)
