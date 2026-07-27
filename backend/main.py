from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from routers import avatars, synthesis, speech, voice_live
from services import azure_speech, azure_openai
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Executive AI Avatar Platform")
    print(f"Speech Region: {settings.AZURE_SPEECH_REGION}")
    yield
    print("Shutting down...")
    # Close shared HTTP client and credentials to prevent resource exhaustion
    await azure_speech.aclose()
    if azure_openai._credential is not None:
        await azure_openai._credential.close()
        azure_openai._credential = None
    if azure_openai._client is not None:
        await azure_openai._client.close()
        azure_openai._client = None


app = FastAPI(
    title="Executive AI Avatar Platform",
    description="Microsoft Executive AI Avatars — Scripted & Live Interaction",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(avatars.router, prefix="/api/avatars", tags=["Avatars"])
app.include_router(synthesis.router, prefix="/api/synthesis", tags=["Synthesis"])
app.include_router(speech.router, prefix="/api/speech", tags=["Speech"])
app.include_router(voice_live.router, prefix="/api/voice-live", tags=["Voice Live"])


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Executive AI Avatar Platform"}
