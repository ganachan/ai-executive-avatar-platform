from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class AvatarProfile(BaseModel):
    id: str
    name: str
    title: str
    department: str
    avatar_type: Literal["stock", "photo", "custom"] = "stock"
    avatar_character: str
    avatar_style: str
    voice_name: str
    system_prompt: str
    photo_url: Optional[str] = None
    # For VASA-1 photo avatars: Azure Custom Avatar deployment ID
    custom_avatar_id: Optional[str] = None
    # True for custom (trained) avatars — sets customized=true in API calls
    customized: bool = False
    # If True, batch synthesis uses the voice model trained alongside this avatar
    # (useBuiltInVoice API flag). Only valid when customized=True and the avatar
    # was trained with voice sync enabled in Azure Speech Studio.
    use_built_in_voice: bool = False
    created_at: Optional[datetime] = None


class AvatarCreate(BaseModel):
    name: str
    title: str
    department: str
    avatar_type: Literal["stock", "photo", "custom"] = "stock"
    avatar_character: str = "harry"
    avatar_style: str = "business"
    voice_name: str = "en-US-GuyNeural"
    system_prompt: str
    photo_url: Optional[str] = None
    custom_avatar_id: Optional[str] = None
    customized: bool = False
    use_built_in_voice: bool = False


class AvatarUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    avatar_type: Optional[Literal["stock", "photo", "custom"]] = None
    avatar_character: Optional[str] = None
    avatar_style: Optional[str] = None
    voice_name: Optional[str] = None
    system_prompt: Optional[str] = None
    photo_url: Optional[str] = None
    custom_avatar_id: Optional[str] = None
    customized: Optional[bool] = None
    use_built_in_voice: Optional[bool] = None


class ScriptSynthesisRequest(BaseModel):
    avatar_id: str
    script: str
    background_color: Optional[str] = "#FFFFFFFF"
    subtitles: Optional[bool] = True


class SynthesisJob(BaseModel):
    job_id: str
    avatar_id: str
    avatar_name: str
    script_preview: str
    status: str  # Running, Succeeded, Failed
    video_url: Optional[str] = None
    created_at: datetime


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class LiveChatRequest(BaseModel):
    avatar_id: str
    message: str
    conversation_history: list[ChatMessage] = []


class LiveChatResponse(BaseModel):
    response: str
    conversation_history: list[ChatMessage]


class SpeechTokenResponse(BaseModel):
    token: str
    region: str


class IceTokenResponse(BaseModel):
    Urls: list[str]
    Username: str
    Password: str
