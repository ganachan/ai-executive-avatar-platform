import httpx
import uuid
import logging
from config import settings
from azure.identity.aio import DefaultAzureCredential

logger = logging.getLogger(__name__)

# Official API version from the Azure batch-avatar sample
BATCH_AVATAR_API_VERSION = "2024-08-01"

SPEECH_TOKEN_URL = (
    f"https://{settings.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com"
    "/sts/v1.0/issueToken"
)
ICE_TOKEN_URL = (
    f"https://{settings.AZURE_SPEECH_REGION}.tts.speech.microsoft.com"
    "/cognitiveservices/avatar/relay/token/v1"
)

_credential: DefaultAzureCredential | None = None

# Shared long-lived HTTP client — avoids per-request connection overhead and
# prevents connection/thread exhaustion under concurrent load.
_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


def _batch_synthesis_url(job_id: str = "") -> str:
    """
    Build the batch synthesis URL.

    Auth rules for Azure batch synthesis:
    - Entra ID (no API key) → MUST use a custom subdomain endpoint
        e.g. https://{resource}.cognitiveservices.azure.com
    - API key → can use either the custom subdomain OR the regional endpoint
        e.g. https://{region}.api.cognitive.microsoft.com

    Priority:
    1. AZURE_BATCH_ENDPOINT if explicitly set (override)
    2. AZURE_SPEECH_ENDPOINT (custom subdomain — required for Entra ID)
    3. Regional fallback (only safe when AZURE_SPEECH_KEY is set)
    """
    if settings.AZURE_BATCH_ENDPOINT:
        base = settings.AZURE_BATCH_ENDPOINT.rstrip("/")
    elif settings.AZURE_SPEECH_ENDPOINT:
        base = settings.AZURE_SPEECH_ENDPOINT.rstrip("/")
    else:
        base = f"https://{settings.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com"
    path = f"{base}/avatar/batchsyntheses"
    if job_id:
        path += f"/{job_id}"
    url = f"{path}?api-version={BATCH_AVATAR_API_VERSION}"
    logger.debug("Batch synthesis URL: %s", url)
    return url


async def aclose() -> None:
    """Close the shared HTTP client and credential on application shutdown."""
    global _http_client, _credential
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None
    if _credential is not None:
        await _credential.close()
        _credential = None


async def _get_headers() -> dict:
    """Return auth headers — API key if configured, otherwise Entra ID bearer token."""
    if settings.AZURE_SPEECH_KEY:
        return {"Ocp-Apim-Subscription-Key": settings.AZURE_SPEECH_KEY}

    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential()

    token = await _credential.get_token("https://cognitiveservices.azure.com/.default")
    return {"Authorization": f"Bearer {token.token}"}


async def create_batch_synthesis(
    script: str,
    voice_name: str,
    avatar_character: str,
    avatar_style: str,
    background_color: str = "#FFFFFFFF",
    subtitles: bool = True,
    customized: bool = False,
    use_built_in_voice: bool = False,
    background_image_url: str | None = None,
) -> dict:
    """
    Submit a talking-avatar batch synthesis job using the official API format.

    Uses PUT /{speech_endpoint}/avatar/batchsyntheses/{uuid}?api-version=2024-08-01
    with the payload structure from the Azure batch-avatar sample.

    For custom (trained) avatars set customized=True — style is omitted and
    the character field becomes the custom avatar model name.

    Set use_built_in_voice=True for custom avatars trained with voice sync
    (useBuiltInVoice in the API) to use the paired voice model for lip-sync.
    Only valid when customized=True.
    """
    job_id = str(uuid.uuid4())
    avatar_config: dict = {
        "talkingAvatarCharacter": avatar_character,
        "customized": customized,
        "videoFormat": "mp4",
        "videoCodec": "h264",
        "subtitleType": "soft_embedded" if subtitles else "none",
        "useBuiltInVoice": use_built_in_voice,
    }
    # backgroundImage and backgroundColor are mutually exclusive in the API.
    # A provided background image URL takes priority over the colour setting.
    # Validate that the URL actually serves image bytes before using it —
    # redirect-based URLs (OneDrive, GDrive) return HTML and cause Azure to fail.
    resolved_image_url: str | None = None
    if background_image_url:
        try:
            head = await _get_http_client().head(background_image_url, follow_redirects=True, timeout=8.0)
            ct = head.headers.get("content-type", "")
            if head.is_success and ct.startswith("image/"):
                resolved_image_url = str(head.url)  # use final URL after redirects
            else:
                logger.warning(
                    "Background image URL did not return an image (status=%s content-type=%s) — "
                    "falling back to backgroundColor. Use a direct Azure Blob URL instead.",
                    head.status_code, ct,
                )
        except Exception as exc:
            logger.warning("Could not reach background image URL (%s) — falling back to backgroundColor.", exc)

    if resolved_image_url:
        avatar_config["backgroundImage"] = resolved_image_url
    else:
        avatar_config["backgroundColor"] = background_color
    # Stock avatars require a style; custom avatars must NOT include it
    if not customized and avatar_style:
        avatar_config["talkingAvatarStyle"] = avatar_style

    payload = {
        "synthesisConfig": {
            "voice": voice_name,
        },
        "inputKind": "PlainText",
        "inputs": [
            {"content": script},
        ],
        "avatarConfig": avatar_config,
    }
    headers = await _get_headers()
    headers["Content-Type"] = "application/json"
    url = _batch_synthesis_url(job_id)
    client = _get_http_client()
    resp = await client.put(url, json=payload, headers=headers)
    if not resp.is_success:
        body = resp.text[:2000]
        logger.error("Batch synthesis PUT %s → %s: %s", url, resp.status_code, body)
        resp.raise_for_status()
    result = resp.json()
    # Ensure the job_id is always present in the result
    result.setdefault("id", job_id)
    return result


async def create_photo_synthesis(
    script: str,
    voice_name: str,
    photo_url: str,
    custom_avatar_id: str | None = None,
    subtitles: bool = True,
) -> dict:
    """
    VASA-1 photo avatar batch synthesis using the official API format.

    Uses the same PUT endpoint as stock avatars but with photoAvatarBaseModel = "vasa-1"
    in the avatarConfig block, as documented in the Azure batch-avatar sample.
    """
    job_id = str(uuid.uuid4())
    payload = {
        "synthesisConfig": {
            "voice": voice_name,
        },
        "inputKind": "PlainText",
        "inputs": [
            {"content": script},
        ],
        "avatarConfig": {
            "photoAvatarBaseModel": "vasa-1",
            "talkingAvatarCharacter": custom_avatar_id or "anika",
            "talkingAvatarStyle": "",
            "customized": False,
            "videoFormat": "mp4",
            "videoCodec": "h264",
            "subtitleType": "soft_embedded" if subtitles else "none",
            "backgroundColor": "#00000000",
        },
    }

    # If a custom VASA endpoint is configured, use that; otherwise use the
    # standard batch synthesis endpoint which supports vasa-1 photo avatars.
    if settings.AZURE_VASA_ENDPOINT:
        base_url = (
            f"{settings.AZURE_VASA_ENDPOINT.rstrip('/')}/avatar/batchsyntheses"
            f"/{job_id}?api-version={BATCH_AVATAR_API_VERSION}"
        )
    else:
        base_url = _batch_synthesis_url(job_id)

    headers = await _get_headers()
    headers["Content-Type"] = "application/json"
    client = _get_http_client()
    resp = await client.put(base_url, json=payload, headers=headers)
    resp.raise_for_status()
    result = resp.json()
    result.setdefault("id", job_id)
    return result


async def get_batch_synthesis_status(job_id: str) -> dict:
    url = _batch_synthesis_url(job_id)
    headers = await _get_headers()
    client = _get_http_client()
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json()


async def get_speech_token() -> str:
    """
    Return a speech auth token for the frontend Speech SDK.

    - API key mode:  POST to the STS issueToken endpoint → returns a short-lived JWT.
    - Entra ID mode: Skip STS (it doesn't accept Bearer tokens).
                     Return token in "aad#<resourceId>#<aadToken>" format,
                     which the Speech SDK accepts via fromAuthorizationToken().
    """
    if settings.AZURE_SPEECH_KEY:
        headers = {"Ocp-Apim-Subscription-Key": settings.AZURE_SPEECH_KEY}
        client = _get_http_client()
        resp = await client.post(SPEECH_TOKEN_URL, headers=headers)
        resp.raise_for_status()
        return resp.text

    # Entra ID path — construct AAD token in SDK-accepted format
    global _credential
    if _credential is None:
        _credential = DefaultAzureCredential()

    aad = await _credential.get_token("https://cognitiveservices.azure.com/.default")
    resource_id = settings.AZURE_SPEECH_RESOURCE_ID
    if not resource_id:
        raise ValueError(
            "AZURE_SPEECH_RESOURCE_ID must be set in .env when using Entra ID auth. "
            "Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/"
            "Microsoft.CognitiveServices/accounts/{name}"
        )
    return f"aad#{resource_id}#{aad.token}"


async def get_ice_token() -> dict:
    """
    Fetch ICE relay server credentials for WebRTC.

    The region-based endpoint (*.tts.speech.microsoft.com) only accepts API keys.
    When using Entra ID, we must use the resource-scoped endpoint
    (*.cognitiveservices.azure.com) which accepts Bearer tokens.
    """
    headers = await _get_headers()
    if settings.AZURE_SPEECH_KEY:
        # API key: use the region endpoint with Ocp-Apim-Subscription-Key header
        url = ICE_TOKEN_URL
    else:
        # Entra ID: use the resource-scoped endpoint (accepts Authorization: Bearer)
        base = settings.AZURE_SPEECH_ENDPOINT.rstrip("/")
        if not base:
            raise ValueError(
                "AZURE_SPEECH_ENDPOINT must be set when using Entra ID auth. "
                "Format: https://{resource_name}.cognitiveservices.azure.com"
            )
        url = f"{base}/tts/cognitiveservices/avatar/relay/token/v1"

    client = _get_http_client()
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json()
