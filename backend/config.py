from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    AZURE_SPEECH_KEY: str = ""
    AZURE_SPEECH_REGION: str = "eastus"
    AZURE_OPENAI_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o"
    # VASA-1 photo avatar synthesis endpoint (Azure Custom Avatar / VASA deployment)
    # Format: https://{region}.api.cognitive.microsoft.com/avatar/vasa/v1
    AZURE_VASA_ENDPOINT: str = ""
    # Azure Speech resource ARM ID — required for Entra ID auth with the Speech SDK
    # Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.CognitiveServices/accounts/{name}
    AZURE_SPEECH_RESOURCE_ID: str = ""
    # Resource-scoped hostname for Entra ID auth (avoids 401 on region-only endpoints)
    # Format: https://{resource_name}.cognitiveservices.azure.com
    AZURE_SPEECH_ENDPOINT: str = ""
    # Voice Live API model — gpt-4o | gpt-4.1 | gpt-realtime | phi4-mm-realtime …
    VOICE_LIVE_MODEL: str = "gpt-4o"
    # AI Foundry endpoint for Voice Live API (services.ai.azure.com or cognitiveservices.azure.com)
    # Set explicitly so it is not shadowed by an OS-level AZURE_OPENAI_ENDPOINT var.
    # Format: https://{resource}.services.ai.azure.com
    VOICE_LIVE_ENDPOINT: str = ""
    # Chat completions endpoint — set explicitly to avoid OS-level AZURE_OPENAI_ENDPOINT override.
    # Format: https://{resource}.openai.azure.com/ or https://{resource}.services.ai.azure.com/
    CHAT_ENDPOINT: str = ""
    # Custom avatar Voice Live endpoint — westus2 TTS websocket for trained custom avatars.
    # Format: https://{region}.tts.speech.microsoft.com/cognitiveservices/websocket/v1
    CUSTOM_AVATAR_ENDPOINT: str = "https://westus2.tts.speech.microsoft.com/cognitiveservices/websocket/v1"
    # Batch avatar synthesis endpoint.
    # The official Azure sample always uses the regional API endpoint:
    #   https://{region}.api.cognitive.microsoft.com
    # Leave blank to auto-build from AZURE_SPEECH_REGION.
    AZURE_BATCH_ENDPOINT: str = ""
    # API key for the custom avatar endpoint (Ocp-Apim-Subscription-Key).
    # When blank, falls back to Entra ID via the AZURE_SPEECH_ENDPOINT resource domain.
    CUSTOM_AVATAR_KEY: str = ""
    # Background image URL applied to all custom (trained) avatar batch synthesis jobs.
    # Must be a direct HTTPS URL to the image file (PNG/JPG, max 1920x1080).
    # When blank, a solid white background colour is used instead.
    CUSTOM_AVATAR_BACKGROUND_IMAGE: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
