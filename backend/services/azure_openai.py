from openai import AsyncAzureOpenAI, AsyncOpenAI
from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from config import settings
from models.schemas import ChatMessage

_client: AsyncAzureOpenAI | None = None
_minimax_client: AsyncOpenAI | None = None
_minimax_token_provider = None
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


def get_minimax_client() -> AsyncOpenAI:
    """
    Returns a shared AsyncOpenAI client pointed at the MiniMax (Fireworks)
    deployment on Azure AI Foundry.

    Auth: Entra ID bearer token with scope https://ai.azure.com/.default
    (different scope from the Azure OpenAI / cognitiveservices path).

    Note: unlike AsyncAzureOpenAI's `azure_ad_token_provider`, the generic
    AsyncOpenAI client does NOT invoke a callable passed as `api_key` — it
    just stringifies whatever is passed into the `Authorization: Bearer`
    header. So the token must be resolved up front and refreshed by
    re-assigning `client.api_key` before each request (see
    `_get_minimax_token` below).
    """
    global _minimax_client, _minimax_token_provider, _credential
    if _minimax_client is not None:
        return _minimax_client

    if _credential is None:
        _credential = DefaultAzureCredential()

    _minimax_token_provider = get_bearer_token_provider(
        _credential,
        "https://ai.azure.com/.default",
    )
    _minimax_client = AsyncOpenAI(
        base_url=settings.MINIMAX_ENDPOINT,
        api_key="placeholder",  # refreshed via _get_minimax_token() before each request
    )
    return _minimax_client


async def _get_minimax_token() -> str:
    """Resolve a fresh Entra ID bearer token for the MiniMax endpoint.

    `get_bearer_token_provider` internally caches the token and only makes a
    network call when it is near expiry, so calling this before every
    request is cheap.
    """
    global _minimax_token_provider
    if _minimax_token_provider is None:
        get_minimax_client()
    return await _minimax_token_provider()


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

    if settings.CHAT_MODEL_PROVIDER == "minimax":
        # Open-source reasoning path: Fireworks MiniMax via Azure AI Foundry
        client = get_minimax_client()
        client.api_key = await _get_minimax_token()
        response = await client.chat.completions.create(
            model=settings.MINIMAX_DEPLOYMENT,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
        )
    else:
        # Default: Azure OpenAI (GPT-4o)
        client = get_client()
        response = await client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
        )
    return response.choices[0].message.content or ""
