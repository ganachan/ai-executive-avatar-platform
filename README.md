# AI Avatar Platform

A full-stack platform for creating and interacting with AI-powered video avatars using **Azure AI Speech** (TTS Avatar) and **Azure OpenAI / Foundry**. Supports scripted batch synthesis, live voice interaction, and an MCP server for agent integrations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 15 Frontend  (localhost:3000)                  │
│  ─ Avatar Library  ─ Studio  ─ Interact  ─ Admin        │
└───────────────────┬─────────────────────────────────────┘
                    │  REST / WebSocket
┌───────────────────▼─────────────────────────────────────┐
│  FastAPI Backend  (localhost:8000)                       │
│  ─ /api/avatars   ─ /api/synthesis  ─ /api/speech        │
│  ─ /api/voice-live                                       │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
  Azure AI Speech           Azure OpenAI
  (TTS Avatar, batch         (GPT-4o chat,
   & live rendering)          Voice Live API)
```

An **MCP server** (`mcp/`) wraps the platform API so any MCP-compatible agent (Claude Desktop, VS Code Copilot, custom agents) can trigger avatar generation without direct Azure credentials.

---

## Features

| Feature | Description |
|---|---|
| **Avatar Library** | Browse and manage stock + custom trained avatars |
| **Scripted Synthesis** | Submit a text script → Azure renders a video asynchronously |
| **Live Interaction** | Real-time voice conversation powered by Azure Voice Live API |
| **Admin Studio** | Create/edit avatar profiles with custom system prompts |
| **MCP Tools** | `list_avatars`, `generate_avatar_video`, `wait_for_video`, `generate_and_wait` |

---

## Prerequisites

- **Node.js** 18+
- **Python** 3.11+
- An **Azure** subscription with:
  - Azure AI Speech resource (TTS Avatar enabled)
  - Azure OpenAI / AI Foundry resource (GPT-4o deployed)
- `az login` configured (Entra ID auth — no API keys required by default)

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/ganachan/ai-avatar-platform.git
cd ai-avatar-platform
```

### 2. Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# Fill in your Azure resource details (see table below)

# Frontend
cp frontend/.env.example frontend/.env
# Set NEXT_PUBLIC_API_URL if backend is not on localhost:8000
```

#### Backend `.env` reference

| Variable | Required | Description |
|---|---|---|
| `AZURE_SPEECH_REGION` | ✅ | Azure region, e.g. `westus2` |
| `AZURE_SPEECH_RESOURCE_ID` | ✅ | Full ARM resource ID of the Speech account |
| `AZURE_SPEECH_ENDPOINT` | ✅ | `https://{resource}.cognitiveservices.azure.com` |
| `AZURE_OPENAI_ENDPOINT` | ✅ | Azure OpenAI or Foundry endpoint |
| `AZURE_OPENAI_DEPLOYMENT` | ✅ | Deployed model name, e.g. `gpt-4o` |
| `CHAT_ENDPOINT` | ✅ | Explicit chat completions endpoint |
| `VOICE_LIVE_ENDPOINT` | ✅ | AI Foundry endpoint for Voice Live API |
| `VOICE_LIVE_MODEL` | ✅ | Model for voice live, e.g. `gpt-4o` |
| `AZURE_SPEECH_KEY` | ⬜ | Leave blank to use Entra ID (`az login`) |
| `AZURE_OPENAI_KEY` | ⬜ | Leave blank to use Entra ID (`az login`) |
| `CUSTOM_AVATAR_ENDPOINT` | ⬜ | WebSocket endpoint for trained custom avatars |
| `CUSTOM_AVATAR_KEY` | ⬜ | API key for custom avatar endpoint |
| `AZURE_VASA_ENDPOINT` | ⬜ | VASA-1 photo avatar endpoint (optional) |

### 3. Install dependencies

```bash
# Python backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r backend/requirements.txt

# Frontend
npm install            # installs concurrently (root)
npm run install:frontend
```

### 4. Run

```bash
# Both together (recommended)
npm run dev
```

Or separately:

```bash
# Terminal 1 — Backend (port 8000)
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

Open **http://localhost:3000**.  
API docs at **http://localhost:8000/docs**.

---

## MCP Server

Exposes avatar generation as MCP tools for AI agents.

```bash
# Install MCP dependencies
pip install -r mcp/requirements.txt

# stdio mode (Claude Desktop, VS Code Copilot)
python mcp/server.py

# SSE mode (web clients)
python mcp/server.py --sse
```

See [mcp/README.md](mcp/README.md) for full integration instructions.

---

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Pydantic settings (reads .env)
│   ├── requirements.txt
│   ├── models/
│   │   └── schemas.py       # Pydantic request/response models
│   ├── routers/
│   │   ├── avatars.py       # Avatar CRUD + registry
│   │   ├── synthesis.py     # Batch video synthesis
│   │   ├── speech.py        # TTS / Speech token endpoints
│   │   └── voice_live.py    # Real-time Voice Live WebSocket
│   └── services/
│       ├── azure_speech.py  # Azure Speech SDK wrapper
│       └── azure_openai.py  # Azure OpenAI client
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router pages
│       ├── components/      # React components
│       └── lib/             # API client + TypeScript types
├── mcp/
│   ├── server.py            # MCP server (stdio + SSE)
│   └── mcp.config.json      # VS Code MCP configuration
└── package.json             # Root scripts (concurrently)
```

---

## License

MIT
