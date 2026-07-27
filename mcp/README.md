# AI Avatar Platform — MCP Server

Exposes executive avatar video generation as MCP tools. Developers can wire avatar generation into any AI application (Claude Desktop, VS Code Copilot, custom agents) without needing Azure credentials or knowledge of the underlying avatar models.

---

## Available Tools

| Tool | Description |
|---|---|
| `list_avatars` | List all available executive avatar IDs and their names |
| `generate_avatar_video` | Submit a video generation job from a text script (async) |
| `get_video_status` | Poll a job for its status and video download URL |
| `wait_for_video` | Poll until a job completes (handles retries automatically) |
| `generate_and_wait` | Generate + wait in one call — returns `video_url` directly |

---

## Quick Start

### 1. Install dependencies

```bash
pip install -r mcp/requirements.txt
```

### 2. Start the platform backend (required)

```bash
# From the project root
uvicorn backend.main:app --port 8000
```

### 3. Run the MCP server

**stdio mode** (Claude Desktop, VS Code Copilot Agent):
```bash
python mcp/server.py
```

**SSE mode** (web clients, custom agents):
```bash
python mcp/server.py --sse
```

---

## Connecting from Claude Desktop

Add to `claude_desktop_config.json` (`~/Library/Application Support/Claude/` on Mac, `%APPDATA%\Claude\` on Windows):

```json
{
  "mcpServers": {
    "ai-executive-avatar-platform": {
      "command": "python",
      "args": ["/absolute/path/to/project/mcp/server.py"],
      "env": {
        "AVATAR_PLATFORM_URL": "http://localhost:8000"
      }
    }
  }
}
```

---

## Connecting from VS Code Copilot

Add to your workspace `.vscode/mcp.json` or use the provided `mcp/mcp.config.json` as a reference:

```json
{
  "servers": {
    "ai-executive-avatar-platform": {
      "type": "stdio",
      "command": "python",
      "args": ["mcp/server.py"],
      "env": {
        "AVATAR_PLATFORM_URL": "http://localhost:8000"
      }
    }
  }
}
```

---

## Example Usage (via an AI agent)

```
List the available avatars.
→ [list_avatars] → [ { "avatar_id": "binaka-half", "name": "Binaka", ... }, ... ]

Generate a video of Binaka announcing the Q2 results.
→ [generate_and_wait] avatar_id="binaka-half", script="Good morning. Our Q2 results exceeded targets..."
→ { "status": "Succeeded", "video_url": "https://...mp4" }
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `AVATAR_PLATFORM_URL` | `http://localhost:8000` | URL of the FastAPI backend |

---

## Security Notes

- The MCP server is a **proxy** — it forwards requests to the platform backend.
- Developers never see Azure credentials, Speech resource names, or avatar model IDs.
- To restrict which avatars a developer can access, add an API key or Entra ID check in the platform backend `/api/avatars/` endpoint before deploying externally.
- For production, deploy the backend + MCP server behind Azure API Management with per-developer subscription keys.
