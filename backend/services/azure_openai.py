from openai import AsyncAzureOpenAI
from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from config import settings
from models.schemas import ChatMessage

_client: AsyncAzureOpenAI | None = None
_credential: DefaultAzureCredential | None = None


def get_client() -> AsyncAzureOpenAI:
    global _client, _credential

    if _client is not None:
        return _client

    if settings.AZURE_OPENAI_KEY:
        # API key auth — use CHAT_ENDPOINT (explicit .env var, not shadowed by OS)
        endpoint = settings.CHAT_ENDPOINT or settings.AZURE_OPENAI_ENDPOINT
        _client = AsyncAzureOpenAI(
            api_key=settings.AZURE_OPENAI_KEY,
            azure_endpoint=endpoint,
            api_version="2024-08-01-preview",
        )
    else:
        # Entra ID auth — prefer VOICE_LIVE_ENDPOINT to avoid OS-level
        # AZURE_OPENAI_ENDPOINT variable shadowing the .env value.
        endpoint = settings.VOICE_LIVE_ENDPOINT or settings.AZURE_OPENAI_ENDPOINT
        _credential = DefaultAzureCredential()
        token_provider = get_bearer_token_provider(
            _credential,
            "https://cognitiveservices.azure.com/.default",
        )
        _client = AsyncAzureOpenAI(
            azure_ad_token_provider=token_provider,
            azure_endpoint=endpoint,
            api_version="2024-08-01-preview",
        )

    return _client


async def get_avatar_response(
    system_prompt: str,
    user_message: str,
    conversation_history: list[ChatMessage],
) -> str:
    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    # Keep last 10 turns to stay within token limits
    for msg in conversation_history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": user_message})

    client = get_client()
    response = await client.chat.completions.create(
        model=settings.AZURE_OPENAI_DEPLOYMENT,
        messages=messages,
        max_tokens=300,
        temperature=0.7,
    )
    return response.choices[0].message.content or ""
