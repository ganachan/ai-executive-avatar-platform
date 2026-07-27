"""
AI Avatar Platform — MCP Server
================================
Exposes executive avatar generation as MCP tools so any AI developer can
wire avatar video generation into their applications without knowing the
underlying Azure Speech resource or avatar model names.

Usage
-----
  uv run server.py                # stdio transport (Claude Desktop, VS Code Copilot)
  uv run server.py --sse          # SSE transport  (web clients, custom agents)

Authentication
--------------
The server uses the same Entra ID credential chain as the main platform
(az login locally, managed identity in production). No secrets are passed
to developers — they authenticate to THIS server; the server authenticates
to Azure on their behalf.

Set AVATAR_PLATFORM_URL in the environment to point at the FastAPI backend.
"""

from __future__ import annotations

import os
import sys
import asyncio
import httpx
from mcp.server.fastmcp import FastMCP

# ── Config ────────────────────────────────────────────────────────────────────
PLATFORM_URL = os.environ.get("AVATAR_PLATFORM_URL", "http://localhost:8000").rstrip("/")

# ── Shared HTTP client ─────────────────────────────────────────────────────────
_client: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=PLATFORM_URL, timeout=120.0)
    return _client


# ── MCP server ────────────────────────────────────────────────────────────────
mcp = FastMCP("AI Avatar Platform")


# ── Tools ──────────────────────────────────────────────────────────────────────

@mcp.tool()
async def list_avatars() -> list[dict]:
    """
    List all available executive avatar models on the platform.

    Returns a list of avatars with their ID, name, type (stock/custom), and
    a short description. Use the `avatar_id` field when calling other tools.
    """
    resp = await _http().get("/api/avatars/")
    resp.raise_for_status()
    avatars = resp.json()
    # Surface only the fields developers need; hide internal model details
    return [
        {
            "avatar_id": a["id"],
            "name": a["name"],
            "title": a["title"],
            "type": a["avatar_type"],
            "description": a.get("system_prompt", ""),
        }
        for a in avatars
    ]


@mcp.tool()
async def generate_avatar_video(
    avatar_id: str,
    script: str,
    subtitles: bool = True,
) -> dict:
    """
    Generate a scripted avatar video from a text script.

    Submits an async batch synthesis job. Returns a `job_id` you can poll
    with `get_video_status` until the status is "Succeeded" and a
    `video_url` is available.

    Args:
        avatar_id:  ID of the avatar to use (from `list_avatars`).
        script:     The spoken text for the avatar. Plain text, max ~5 000 chars.
        subtitles:  Whether to burn soft subtitles into the video (default True).

    Returns:
        job_id, avatar_name, status ("Running"), and script_preview.
    """
    resp = await _http().post(
        "/api/synthesis/batch",
        json={
            "avatar_id": avatar_id,
            "script": script,
            "subtitles": subtitles,
        },
    )
    if not resp.is_success:
        detail = resp.json().get("detail", resp.text)
        raise RuntimeError(f"Video generation failed ({resp.status_code}): {detail}")
    data = resp.json()
    return {
        "job_id": data["job_id"],
        "avatar_name": data["avatar_name"],
        "status": data["status"],
        "script_preview": data["script_preview"],
    }


@mcp.tool()
async def get_video_status(job_id: str) -> dict:
    """
    Check the status of a previously submitted avatar video job.

    Poll this tool after calling `generate_avatar_video`. When `status` is
    "Succeeded", the `video_url` field contains a direct download link to
    the MP4 file (valid for 24 hours).

    Args:
        job_id:  The job ID returned by `generate_avatar_video`.

    Returns:
        status ("Running" | "Succeeded" | "Failed"), video_url (when ready).
    """
    resp = await _http().get(f"/api/synthesis/batch/{job_id}")
    if not resp.is_success:
        detail = resp.json().get("detail", resp.text)
        raise RuntimeError(f"Status check failed ({resp.status_code}): {detail}")
    data = resp.json()
    return {
        "job_id": data["job_id"],
        "avatar_name": data["avatar_name"],
        "status": data["status"],
        "video_url": data.get("video_url"),
        "script_preview": data["script_preview"],
    }


@mcp.tool()
async def wait_for_video(job_id: str, poll_interval_seconds: int = 5, max_wait_seconds: int = 300) -> dict:
    """
    Wait for an avatar video job to complete and return the result.

    Convenience wrapper around `get_video_status` — polls automatically
    until the job succeeds or fails. Use this instead of manual polling
    when you want a single blocking call.

    Args:
        job_id:                 The job ID from `generate_avatar_video`.
        poll_interval_seconds:  How often to check (default 5s).
        max_wait_seconds:       Give up after this many seconds (default 300s = 5 min).

    Returns:
        video_url, status, avatar_name on success.
    """
    waited = 0
    while waited < max_wait_seconds:
        result = await get_video_status(job_id)
        if result["status"] == "Succeeded":
            return result
        if result["status"] == "Failed":
            raise RuntimeError(f"Avatar video job {job_id} failed on the server.")
        await asyncio.sleep(poll_interval_seconds)
        waited += poll_interval_seconds
    raise TimeoutError(
        f"Avatar video job {job_id} did not complete within {max_wait_seconds}s. "
        "Call get_video_status() to continue polling."
    )


@mcp.tool()
async def generate_and_wait(
    avatar_id: str,
    script: str,
    subtitles: bool = True,
) -> dict:
    """
    Generate an avatar video and wait for it to finish in one step.

    Combines `generate_avatar_video` + `wait_for_video`. Best for simple
    use cases where you want to generate a video and immediately get the URL.

    Args:
        avatar_id:  ID of the avatar (from `list_avatars`).
        script:     Spoken text for the avatar.
        subtitles:  Whether to include soft subtitles (default True).

    Returns:
        video_url (direct MP4 download link), avatar_name, status.
    """
    job = await generate_avatar_video(avatar_id=avatar_id, script=script, subtitles=subtitles)
    return await wait_for_video(job_id=job["job_id"])


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    transport = "sse" if "--sse" in sys.argv else "stdio"
    mcp.run(transport=transport)
