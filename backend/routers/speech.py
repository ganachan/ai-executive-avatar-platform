from fastapi import APIRouter, HTTPException
from models.schemas import (
    SpeechTokenResponse,
    IceTokenResponse,
    LiveChatRequest,
    LiveChatResponse,
    ChatMessage,
)
from services import azure_speech, azure_openai
from routers.avatars import AVATARS
from config import settings

router = APIRouter()


@router.post("/token", response_model=SpeechTokenResponse)
async def get_speech_token():
    try:
        token = await azure_speech.get_speech_token()
        return SpeechTokenResponse(token=token, region=settings.AZURE_SPEECH_REGION)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to get speech token: {str(e)}")


@router.post("/ice-token", response_model=IceTokenResponse)
async def get_ice_token():
    try:
        data = await azure_speech.get_ice_token()
        return IceTokenResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to get ICE token: {str(e)}")


@router.post("/chat", response_model=LiveChatResponse)
async def live_chat(payload: LiveChatRequest):
    avatar = AVATARS.get(payload.avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail=f"Avatar '{payload.avatar_id}' not found")

    try:
        response_text = await azure_openai.get_avatar_response(
            system_prompt=avatar.system_prompt,
            user_message=payload.message,
            conversation_history=payload.conversation_history,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Azure OpenAI error: {str(e)}")

    updated_history = list(payload.conversation_history) + [
        ChatMessage(role="user", content=payload.message),
        ChatMessage(role="assistant", content=response_text),
    ]
    return LiveChatResponse(response=response_text, conversation_history=updated_history)
