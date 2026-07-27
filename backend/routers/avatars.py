from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import uuid
from models.schemas import AvatarProfile, AvatarCreate, AvatarUpdate

router = APIRouter()

AVATARS: dict[str, AvatarProfile] = {

    "harry-business": AvatarProfile(
        id="harry-business", name="Harry", title="Business", department="Full Body · Male",
        avatar_type="stock", avatar_character="harry", avatar_style="business",
        voice_name="en-US-GuyNeural",
        system_prompt="You are a helpful AI assistant. Be clear, professional, and concise — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "harry-casual": AvatarProfile(
        id="harry-casual", name="Harry — Casual", title="Casual", department="Full Body · Male",
        avatar_type="stock", avatar_character="harry", avatar_style="casual",
        voice_name="en-US-DavisNeural",
        system_prompt="You are a friendly AI assistant. Be warm, approachable, and helpful — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "harry-youthful": AvatarProfile(
        id="harry-youthful", name="Harry — Youthful", title="Youthful", department="Full Body · Male",
        avatar_type="stock", avatar_character="harry", avatar_style="youthful",
        voice_name="en-US-AndrewNeural",
        system_prompt="You are an energetic AI assistant. Be upbeat, encouraging, and forward-thinking — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "lisa-casual": AvatarProfile(
        id="lisa-casual", name="Lisa", title="Casual Sitting", department="Full Body · Female",
        avatar_type="stock", avatar_character="lisa", avatar_style="casual-sitting",
        voice_name="en-US-AriaNeural",
        system_prompt="You are a helpful AI assistant. Be clear, articulate, and engaging — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    # graceful-sitting is BATCH-ONLY (not available for real-time Voice Live)
    # "lisa-graceful": removed
    "lori-casual": AvatarProfile(
        id="lori-casual", name="Lori", title="Casual", department="Full Body · Female",
        avatar_type="stock", avatar_character="lori", avatar_style="casual",
        voice_name="en-US-JennyNeural",
        system_prompt="You are a friendly AI assistant. Be warm, conversational, and helpful — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "lori-graceful": AvatarProfile(
        id="lori-graceful", name="Lori — Graceful", title="Graceful", department="Full Body · Female",
        avatar_type="stock", avatar_character="lori", avatar_style="graceful",
        voice_name="en-US-NancyNeural",
        system_prompt="You are a professional AI assistant. Be poised, warm, and purposeful — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "lori-formal": AvatarProfile(
        id="lori-formal", name="Lori — Formal", title="Formal", department="Full Body · Female",
        avatar_type="stock", avatar_character="lori", avatar_style="formal",
        voice_name="en-US-SaraNeural",
        system_prompt="You are a professional AI assistant. Be authoritative, precise, and clear — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "max-business": AvatarProfile(
        id="max-business", name="Max", title="Business", department="Full Body · Male",
        avatar_type="stock", avatar_character="max", avatar_style="business",
        voice_name="en-US-GuyNeural",
        system_prompt="You are a professional AI assistant. Be confident, structured, and to the point — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "max-casual": AvatarProfile(
        id="max-casual", name="Max — Casual", title="Casual", department="Full Body · Male",
        avatar_type="stock", avatar_character="max", avatar_style="casual",
        voice_name="en-US-DavisNeural",
        system_prompt="You are a friendly AI assistant. Be relaxed, helpful, and approachable — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "max-formal": AvatarProfile(
        id="max-formal", name="Max — Formal", title="Formal", department="Full Body · Male",
        avatar_type="stock", avatar_character="max", avatar_style="formal",
        voice_name="en-US-AndrewNeural",
        system_prompt="You are a formal AI assistant. Speak with gravitas and precision — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "meg-business": AvatarProfile(
        id="meg-business", name="Meg", title="Business", department="Full Body · Female",
        avatar_type="stock", avatar_character="meg", avatar_style="business",
        voice_name="en-US-AriaNeural",
        system_prompt="You are a professional AI assistant. Be confident, clear, and engaging — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "meg-casual": AvatarProfile(
        id="meg-casual", name="Meg — Casual", title="Casual", department="Full Body · Female",
        avatar_type="stock", avatar_character="meg", avatar_style="casual",
        voice_name="en-US-JennyNeural",
        system_prompt="You are a friendly AI assistant. Be approachable, warm, and helpful — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "meg-formal": AvatarProfile(
        id="meg-formal", name="Meg — Formal", title="Formal", department="Full Body · Female",
        avatar_type="stock", avatar_character="meg", avatar_style="formal",
        voice_name="en-US-NancyNeural",
        system_prompt="You are a formal AI assistant. Speak with authority and structure — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "rowan": AvatarProfile(
        id="rowan", name="Rowan", title="Business", department="Full Body · Neutral",
        avatar_type="stock", avatar_character="rowan", avatar_style="business",
        voice_name="en-US-GuyNeural",
        system_prompt="You are a helpful AI assistant. Be thoughtful, knowledgeable, and reliable — under 3 sentences.",
        photo_url=None, created_at=datetime.now(timezone.utc),
    ),
    "photo-avatar": AvatarProfile(
        id="photo-avatar", name="Custom Photo Avatar", title="Your Photo, Your Voice", department="VASA-1 · Photo",
        avatar_type="photo", avatar_character="custom", avatar_style="business",
        voice_name="en-US-GuyNeural",
        system_prompt="You are a helpful AI assistant. Be professional and concise — under 3 sentences.",
        photo_url=None, custom_avatar_id=None, created_at=datetime.now(timezone.utc),
    ),
    # ── Custom trained avatars ──────────────────────────────────────────────────
    "binaka-half": AvatarProfile(
        id="binaka-half", name="Binaka", title="Custom Avatar", department="Custom · Trained",
        avatar_type="custom", avatar_character="Binaka-half", avatar_style="",
        # voice_name: stock voice for Voice Live real-time sessions
        voice_name="en-US-AriaNeural",
        # use_built_in_voice=True: scripted batch synthesis uses the voice model
        # trained alongside Binaka (useBuiltInVoice API flag) for in-sync lip movement.
        use_built_in_voice=True,
        system_prompt="You are a helpful AI assistant. Be professional, warm, and concise — under 3 sentences.",
        photo_url=None, custom_avatar_id=None, customized=True,
        created_at=datetime.now(timezone.utc),
    ),
}


@router.get("/", response_model=list[AvatarProfile])
def list_avatars():
    return list(AVATARS.values())


@router.get("/{avatar_id}", response_model=AvatarProfile)
def get_avatar(avatar_id: str):
    avatar = AVATARS.get(avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail=f"Avatar '{avatar_id}' not found")
    return avatar


@router.post("/", response_model=AvatarProfile, status_code=201)
def create_avatar(payload: AvatarCreate):
    avatar_id = str(uuid.uuid4())[:8]
    avatar = AvatarProfile(id=avatar_id, created_at=datetime.now(timezone.utc), **payload.model_dump())
    AVATARS[avatar_id] = avatar
    return avatar


@router.put("/{avatar_id}", response_model=AvatarProfile)
def update_avatar(avatar_id: str, payload: AvatarUpdate):
    avatar = AVATARS.get(avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail=f"Avatar '{avatar_id}' not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updated = avatar.model_copy(update=updates)
    AVATARS[avatar_id] = updated
    return updated


@router.delete("/{avatar_id}", status_code=204)
def delete_avatar(avatar_id: str):
    if avatar_id not in AVATARS:
        raise HTTPException(status_code=404, detail=f"Avatar '{avatar_id}' not found")
    del AVATARS[avatar_id]
