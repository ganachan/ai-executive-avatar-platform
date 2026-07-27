"use client";

/**
 * VoiceLiveSession — real-time voice + avatar via Azure Voice Live API.
 *
 * Architecture
 * ─────────────
 * 1. Browser opens a WebSocket to our FastAPI proxy
 *    (GET /api/voice-live/ws?avatar_id=X).
 *    The proxy authenticates server-to-server with the Voice Live API and
 *    forwards all messages bidirectionally.
 *
 * 2. Audio I/O:
 *    • Microphone → ScriptProcessor → PCM-16 LE → base64 →
 *        { type: "input_audio_buffer.append", audio: "…" }  →  WS
 *    • WS  →  { type: "response.audio.delta", delta: "…" }  →
 *        base64 → PCM-16 LE → AudioBufferSourceNode.play()
 *
 * 3. Avatar video (WebRTC):
 *    • Browser creates RTCPeerConnection with one video transceiver.
 *    • On ICE gathering complete, sends
 *        { type: "session.avatar.connect", client_sdp: "…" }  →  WS.
 *    • WS  →  { type: "session.avatar.connecting", server_sdp: "…" }  →
 *        pc.setRemoteDescription() → avatar video starts streaming.
 *
 * 4. Transcript:
 *    • response.audio_transcript.delta / .done → shown in the chat panel.
 *    • conversation.item.input_audio_transcription.completed → user turn shown.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic, MicOff, PhoneOff, Loader, AlertCircle, Radio,
  Volume2,
} from "lucide-react";

const API_WS = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
  .replace("https://", "wss://")
  .replace("http://", "ws://");

// PCM16 chunk size sent per append — must be a power of 2 for ScriptProcessorNode.
// 512 samples ≈ 21 ms at 24 kHz.
const SAMPLES_PER_CHUNK = 512;
const SAMPLE_RATE = 24_000;

interface Utterance {
  role: "user" | "assistant";
  text: string;
  final: boolean;
}

interface Props {
  avatarId: string;
  avatarName: string;
  avatarCharacter: string;
  avatarStyle: string;
}

export default function VoiceLiveSession({
  avatarId,
  avatarName,
  avatarCharacter,
  avatarStyle,
}: Props) {
  /* ── refs ──────────────────────────────────────────────────── */
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // Container div — video/audio elements are created dynamically (per sample)
  const videoRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // ICE servers received from Voice Live API in session.updated
  const iceTokenRef = useRef<RTCIceServer[] | null>(null);
  // Whether we've already sent the avatar SDP offer
  const avatarSdpSentRef = useRef(false);
  // Suppress WebSocket PCM audio once avatar WebRTC audio track is PLAYING
  const avatarAudioActiveRef = useRef(false);
  // Buffer for queued audio chunks (PCM-16 Float32 frames)
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  // Ref-mirror of muted state — prevents stale closure in onaudioprocess
  const mutedRef = useRef(false);
  // Timeout handle for session.avatar.connecting watchdog
  const sdpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── state ─────────────────────────────────────────────────── */
  const [phase, setPhase] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<Utterance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vadActive, setVadActive] = useState(false);   // user is speaking
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  /* ── audio playback helpers ────────────────────────────────── */
  function pcm16ToFloat32(buffer: ArrayBuffer): Float32Array {
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    return float32;
  }

  const playNextChunk = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setBotSpeaking(false);
      return;
    }
    isPlayingRef.current = true;
    setBotSpeaking(true);

    const samples = audioQueueRef.current.shift()!;
    const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buf.copyToChannel(samples, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = playNextChunk;
    src.start();
  }, []);

  function enqueueAudio(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const samples = pcm16ToFloat32(bytes.buffer);
    audioQueueRef.current.push(samples);
    if (!isPlayingRef.current) playNextChunk();
  }

  /* ── microphone capture ────────────────────────────────────── */
  function startMicCapture(ws: WebSocket) {
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    audioCtxRef.current = ctx;
    // Explicitly resume — browsers may start the context in "suspended" state
    // if it was created outside a direct user-gesture handler.
    ctx.resume().catch(() => {});

    navigator.mediaDevices
      .getUserMedia({ audio: { sampleRate: SAMPLE_RATE, channelCount: 1 } })
      .then((stream) => {
        micStreamRef.current = stream;
        const source = ctx.createMediaStreamSource(stream);
        // ScriptProcessorNode (deprecated but universally supported without extra build steps)
        const processor = ctx.createScriptProcessor(SAMPLES_PER_CHUNK, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (
            mutedRef.current ||
            ws.readyState !== WebSocket.OPEN
          )
            return;

          const input = e.inputBuffer.getChannelData(0);
          // Convert Float32 → PCM16 LE
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, input[i] * 32768));
          }
          // Base64 encode
          const bytes = new Uint8Array(pcm.buffer);
          let binary = "";
          bytes.forEach((b) => (binary += String.fromCharCode(b)));
          const b64 = btoa(binary);

          ws.send(
            JSON.stringify({ type: "input_audio_buffer.append", audio: b64 })
          );
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      })
      .catch((err) => {
        setError(`Microphone access denied: ${err.message}`);
      });
  }

  /* ── avatar WebRTC setup ───────────────────────────────────── */
  async function setupAvatarWebRTC(ws: WebSocket) {
    if (avatarSdpSentRef.current) return;
    avatarSdpSentRef.current = true;

    // Use the API’s TURN servers from session.updated (matching the official sample)
    const iceServers = iceTokenRef.current ?? [];
    console.log("[VoiceLive] RTCPeerConnection with", iceServers.length, "ICE server(s)");

    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    // Clear any previous video/audio elements from the container div
    if (videoRef.current) videoRef.current.innerHTML = "";

    // Dynamically create <video>/<audio> elements (exact pattern from official sample)
    pc.ontrack = (e) => {
      console.log("[VoiceLive] ontrack:", e.track.kind, "streams:", e.streams.length);
      const mediaEl = document.createElement(e.track.kind) as HTMLMediaElement;
      mediaEl.id = e.track.kind;
      mediaEl.srcObject = e.streams[0];
      mediaEl.autoplay = true;
      if (e.track.kind === "video") {
        (mediaEl as HTMLVideoElement).playsInline = true;
        mediaEl.style.width = "100%";
        mediaEl.style.height = "100%";
        mediaEl.style.objectFit = "contain";
        mediaEl.style.borderRadius = "inherit";
        console.log("[VoiceLive] ✓ Avatar video track — attaching to container");
        setAvatarReady(true);
      }
      if (e.track.kind === "audio") {
        // Only suppress WebSocket PCM once the WebRTC audio stream actually starts playing
        (mediaEl as HTMLAudioElement).onplay = () => {
          console.log("[VoiceLive] ✓ Avatar WebRTC audio playing — disabling WebSocket PCM fallback");
          avatarAudioActiveRef.current = true;
          audioQueueRef.current = [];
          isPlayingRef.current = false;
          setBotSpeaking(false);
        };
      }
      if (e.track.kind === "video") {
        // Mute the video element so autoplay is never blocked by browser policy
        (mediaEl as HTMLVideoElement).muted = true;
        (mediaEl as HTMLVideoElement).play().catch((err) =>
          console.warn("[VoiceLive] video.play() failed:", err)
        );
      }
      videoRef.current?.appendChild(mediaEl);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) console.log("[VoiceLive] ICE candidate:", e.candidate.type);
      else console.log("[VoiceLive] ICE gathering complete");
    };
    pc.oniceconnectionstatechange = () =>
      console.log("[VoiceLive] ICE:", pc.iceConnectionState);
    pc.onconnectionstatechange = () =>
      console.log("[VoiceLive] PC state:", pc.connectionState);

    // Data channel — required by Voice Live for server-side event notifications
    pc.createDataChannel("eventChannel");
    pc.addEventListener("datachannel", (e) => {
      e.channel.onmessage = (ev) =>
        console.log("[VoiceLive] datachannel msg:", ev.data);
      e.channel.onclose = () =>
        console.log("[VoiceLive] datachannel closed");
    });

    // sendrecv direction — required by Voice Live (recvonly causes negotiation failure)
    pc.addTransceiver("video", { direction: "sendrecv" });
    pc.addTransceiver("audio", { direction: "sendrecv" });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Fixed 2-second wait for ICE candidate gathering (per official sample)
    console.log("[VoiceLive] Waiting 2 s for ICE gathering…");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const localDesc = pc.localDescription;
    if (!localDesc?.sdp) {
      console.error("[VoiceLive] No local SDP — aborting");
      return;
    }
    // Voice Live API expects: base64( json({type, sdp}) )
    // It does: json.loads(base64.b64decode(client_sdp))
    // so we must wrap the SDP in a JSON object before Base64-encoding.
    const sdpJson = JSON.stringify({ type: localDesc.type, sdp: localDesc.sdp });
    const b64sdp = btoa(sdpJson);
    console.log("[VoiceLive] ✓ Sending session.avatar.connect — SDP JSON+base64 len:", b64sdp.length);
    ws.send(JSON.stringify({ type: "session.avatar.connect", client_sdp: b64sdp }));

    // Watchdog: if session.avatar.connecting doesn't arrive within 25 s, the
    // custom avatar model may not be provisioned for real-time streaming.
    sdpTimeoutRef.current = setTimeout(() => {
      if (!avatarSdpSentRef.current) return; // already cleaned up
      console.warn("[VoiceLive] No session.avatar.connecting after 25 s — avatar video unavailable");
      setError("Avatar video stream timed out. The custom avatar may not be provisioned for real-time streaming. Audio-only mode active.");
      setAvatarReady(true); // reveal the (empty) video container so error is visible
    }, 25_000);
  }

  /* ── WebSocket event handling ──────────────────────────────── */
  function handleServerEvent(ws: WebSocket, raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const type = msg.type as string;
    // Log every event for debugging (collapse in DevTools)
    console.debug("[VoiceLive ←]", type, msg);

    switch (type) {
      /* ── session lifecycle ─────────────────────────────── */
      case "session.created": {
        setPhase("connected");
        break;
      }
      case "session.updated": {
        setPhase("connected");
        const session = msg.session as Record<string, unknown> | undefined;
        const avatarCfg = session?.avatar as Record<string, unknown> | undefined;
        console.log("[VoiceLive] session.updated — avatar block:", JSON.stringify(avatarCfg));
        if (avatarCfg) {
          // Store the API’s TURN credentials so setupAvatarWebRTC can use them.
          const apiIce = avatarCfg.ice_servers as RTCIceServer[] | undefined;
          if (apiIce && apiIce.length > 0) {
            console.log("[VoiceLive] ✓ API ICE servers:", apiIce.length);
            iceTokenRef.current = apiIce;
          } else {
            console.warn("[VoiceLive] No ICE servers in avatar block — proceeding without TURN");
          }
          setupAvatarWebRTC(ws);
        } else {
          console.warn("[VoiceLive] session.updated has no avatar block — WebRTC skipped");
        }
        break;
      }

      /* ── avatar SDP exchange ───────────────────────────── */
      case "session.avatar.connecting": {
        // Clear the watchdog — server responded in time
        if (sdpTimeoutRef.current) { clearTimeout(sdpTimeoutRef.current); sdpTimeoutRef.current = null; }
        console.log("[VoiceLive] Got server SDP answer");
        const serverSdpRaw = msg.server_sdp as string | undefined;
        if (serverSdpRaw && pcRef.current) {
          // API sends server_sdp as base64( json({type, sdp}) ) — mirror of what we sent.
          let serverSdp = "";
          let serverType: RTCSdpType = "answer";
          try {
            const decoded = atob(serverSdpRaw);
            try {
              const parsed = JSON.parse(decoded) as { sdp?: string; type?: string };
              serverSdp = parsed.sdp ?? decoded;
              serverType = (parsed.type as RTCSdpType) ?? "answer";
              console.log("[VoiceLive] Server SDP JSON-decoded, len:", serverSdp.length);
            } catch {
              // Decoded but not JSON — treat the decoded string as raw SDP
              serverSdp = decoded;
              console.log("[VoiceLive] Server SDP plain-decoded, len:", serverSdp.length);
            }
          } catch {
            // Not Base64 at all — use as-is
            serverSdp = serverSdpRaw;
            console.warn("[VoiceLive] server_sdp is not Base64 — using raw");
          }
          pcRef.current
            .setRemoteDescription({ type: serverType, sdp: serverSdp })
            .then(() => console.log("[VoiceLive] ✓ Remote description set — WebRTC connecting"))
            .catch((e) => console.error("[VoiceLive] setRemoteDescription failed:", e));
        } else {
          console.error("[VoiceLive] session.avatar.connecting missing server_sdp", msg);
        }
        break;
      }

      /* ── voice activity ────────────────────────────────── */
      case "input_audio_buffer.speech_started":
        setVadActive(true);
        // Interrupt ongoing WS-buffered bot speech
        audioQueueRef.current = [];
        isPlayingRef.current = false;
        setBotSpeaking(false);
        break;
      case "input_audio_buffer.speech_stopped":
        setVadActive(false);
        break;

      /* ── audio output (WebSocket PCM path) ────────────── */
      case "response.audio.delta": {
        // Suppress if the avatar WebRTC audio track is active
        // (avatar sends synchronised audio via RTP — no need to double-play)
        if (!avatarAudioActiveRef.current) {
          const delta = msg.delta as string | undefined;
          if (delta) enqueueAudio(delta);
        }
        break;
      }

      /* ── transcript (streaming) ────────────────────────── */
      case "response.audio_transcript.delta": {
        const text = msg.delta as string | undefined;
        if (!text) break;
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && !last.final) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + text },
            ];
          }
          return [...prev, { role: "assistant", text, final: false }];
        });
        break;
      }
      case "response.audio_transcript.done":
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            return [...prev.slice(0, -1), { ...last, final: true }];
          }
          return prev;
        });
        break;

      /* ── user transcript ───────────────────────────────── */
      case "conversation.item.input_audio_transcription.completed": {
        // The Voice Live API sends `transcript` at the top level — NOT inside item.content
        const text = (msg.transcript as string | undefined) ?? "";
        if (text.trim()) {
          setTranscript((prev) => [
            ...prev,
            { role: "user", text, final: true },
          ]);
        }
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        const delta = msg.delta as string | undefined;
        if (!delta) break;
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "user" && !last.final) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + delta },
            ];
          }
          return [...prev, { role: "user", text: delta, final: false }];
        });
        break;
      }

      /* ── errors ────────────────────────────────────────── */
      case "error": {
        const err = msg.error as Record<string, string> | undefined;
        setError(err?.message ?? "Unknown error from Voice Live API");
        break;
      }
    }
  }

  /* ── session start / stop ──────────────────────────────────── */
  const startSession = async () => {
    setPhase("connecting");
    setError(null);
    setTranscript([]);
    setAvatarReady(false);
    setMuted(false);
    mutedRef.current = false;
    avatarSdpSentRef.current = false;
    avatarAudioActiveRef.current = false;
    iceTokenRef.current = null; // will be populated from session.updated
    if (sdpTimeoutRef.current) { clearTimeout(sdpTimeoutRef.current); sdpTimeoutRef.current = null; }

    const wsUrl = `${API_WS}/api/voice-live/ws?avatar_id=${encodeURIComponent(avatarId)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // No ICE servers in the init message — the API returns its own TURN
      // credentials in session.updated → session.avatar.ice_servers.
      ws.send(JSON.stringify({ type: "voice_live.init" }));
      startMicCapture(ws);
    };

    ws.onmessage = (e) => {
      // Binary frames (audio/video data) can arrive from the Voice Live API;
      // skip them here — they are handled by the WebRTC peer connection directly.
      if (e.data instanceof Blob || e.data instanceof ArrayBuffer) return;
      handleServerEvent(ws, e.data as string);
    };

    ws.onerror = (e) => {
      console.error("Voice Live WS error", e);
      setError("WebSocket connection error. Check the backend logs.");
      setPhase("error");
    };

    ws.onclose = (e) => {
      if (phase !== "idle") {
        setPhase("idle");
      }
    };
  };

  const stopSession = () => {
    // Cancel any pending watchdog
    if (sdpTimeoutRef.current) { clearTimeout(sdpTimeoutRef.current); sdpTimeoutRef.current = null; }
    // Stop microphone
    processorRef.current?.disconnect();
    processorRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    // Stop audio playback
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    // Close avatar peer connection
    pcRef.current?.close();
    pcRef.current = null;

    // Close WebSocket
    wsRef.current?.close();
    wsRef.current = null;

    iceTokenRef.current = null;
    avatarSdpSentRef.current = false;
    avatarAudioActiveRef.current = false;

    setPhase("idle");
    setVadActive(false);
    setBotSpeaking(false);
    setAvatarReady(false);
    // Clear dynamically created video/audio elements
    if (videoRef.current) videoRef.current.innerHTML = "";
  };

  // Clean up on unmount
  useEffect(() => {
    return () => stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── render ────────────────────────────────────────────────── */
  const isConnected = phase === "connected";
  const isConnecting = phase === "connecting";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* ── Avatar Video ───────────────────────── */}
      <div className="lg:col-span-3 bg-surface rounded-2xl overflow-hidden shadow-xl relative aspect-video">
        {/* Video container — <video>/<audio> elements are appended here dynamically */}
        <div
          ref={videoRef}
          className={`w-full h-full transition-opacity duration-500 ${
            avatarReady ? "opacity-100" : "opacity-0"
          }`}
          style={{ background: "transparent" }}
        />

        {/* Placeholder while waiting for avatar */}
        {!avatarReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
            {isConnecting && (
              <>
                <Loader className="w-10 h-10 text-msblue animate-spin mb-3" />
                <p className="text-gray-400 text-sm">Connecting to Voice Live…</p>
              </>
            )}
            {phase === "idle" && (
              <p className="text-gray-500 text-sm">
                Click <strong className="text-white">Start Voice Live</strong> below
              </p>
            )}
            {phase === "error" && (
              <div className="flex flex-col items-center text-red-400">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p className="text-sm text-center px-4">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Status badges */}
        {isConnected && (
          <div className="absolute top-3 left-3 flex gap-2">
            <span className="bg-green-600/80 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Voice Live
            </span>
            {vadActive && (
              <span className="bg-blue-600/80 text-white text-xs px-2 py-0.5 rounded-full">
                Listening…
              </span>
            )}
            {botSpeaking && (
              <span className="bg-purple-600/80 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                Speaking
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Controls + Transcript ──────────────── */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        {/* Controls */}
        <div className="bg-surface rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">{avatarName}</h2>
              <p className="text-gray-400 text-xs capitalize">
                {avatarCharacter} · {avatarStyle}
              </p>
            </div>
            <span className="bg-indigo-600/20 text-indigo-300 text-xs px-2 py-1 rounded-full flex items-center gap-1">
              <Radio className="w-3 h-3" />
              Voice Live
            </span>
          </div>

          {!isConnected && !isConnecting && (
            <button
              onClick={startSession}
              className="w-full py-3 rounded-xl bg-msblue hover:bg-blue-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Mic className="w-4 h-4" />
              Start Voice Live
            </button>
          )}

          {isConnecting && (
            <button
              disabled
              className="w-full py-3 rounded-xl bg-gray-700 text-gray-400 font-medium flex items-center justify-center gap-2 cursor-not-allowed"
            >
              <Loader className="w-4 h-4 animate-spin" />
              Connecting…
            </button>
          )}

          {isConnected && (
            <div className="flex gap-3">
              <button
                onClick={() => setMuted((m) => { mutedRef.current = !m; return !m; })}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  muted
                    ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                    : "bg-gray-700 hover:bg-gray-600 text-white"
                }`}
              >
                {muted ? (
                  <><MicOff className="w-4 h-4" /> Unmute</>
                ) : (
                  <><Mic className="w-4 h-4" /> Mute</>
                )}
              </button>
              <button
                onClick={stopSession}
                className="flex-1 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <PhoneOff className="w-4 h-4" />
                End
              </button>
            </div>
          )}

          {error && phase !== "error" && (
            <p className="text-red-400 text-xs flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </p>
          )}

          {/* Microphone indicator */}
          {isConnected && (
            <div className="flex items-center gap-2 pt-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  muted
                    ? "bg-red-500"
                    : vadActive
                    ? "bg-green-400 animate-pulse"
                    : "bg-gray-500"
                }`}
              />
              <span className="text-gray-400 text-xs">
                {muted ? "Microphone muted" : vadActive ? "Listening…" : "Mic open"}
              </span>
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="bg-surface rounded-2xl p-4 flex-1 min-h-[200px] max-h-[400px] overflow-y-auto">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">
            Transcript
          </h3>
          {transcript.length === 0 ? (
            <p className="text-gray-600 text-sm text-center mt-6">
              Start speaking — transcript appears here
            </p>
          ) : (
            <div className="space-y-3">
              {transcript.map((u, i) => (
                <div
                  key={i}
                  className={`flex ${
                    u.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                      u.role === "user"
                        ? "bg-msblue/20 text-blue-200"
                        : u.final
                        ? "bg-gray-700 text-gray-100"
                        : "bg-gray-800 text-gray-300 italic"
                    }`}
                  >
                    {u.text}
                    {!u.final && (
                      <span className="inline-block w-1 h-3 bg-gray-400 animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
