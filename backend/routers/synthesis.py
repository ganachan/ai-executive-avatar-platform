import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from datetime import datetime, timezone
from models.schemas import ScriptSynthesisRequest, SynthesisJob
from services import azure_speech
from routers.avatars import AVATARS
from config import settings

router = APIRouter()

# In-memory job store
JOBS: dict[str, SynthesisJob] = {}


@router.post("/batch", response_model=SynthesisJob, status_code=202)
async def create_batch_job(payload: ScriptSynthesisRequest):
    avatar = AVATARS.get(payload.avatar_id)
    if not avatar:
        raise HTTPException(status_code=404, detail=f"Avatar '{payload.avatar_id}' not found")

    try:
        if avatar.avatar_type == "photo":
            if not avatar.photo_url:
                raise HTTPException(
                    status_code=422,
                    detail="Photo avatar requires a photo_url to be set on the avatar profile.",
                )
            result = await azure_speech.create_photo_synthesis(
                script=payload.script,
                voice_name=avatar.voice_name,
                photo_url=avatar.photo_url,
                custom_avatar_id=avatar.custom_avatar_id,
                subtitles=payload.subtitles if payload.subtitles is not None else True,
            )
        else:
            # Both "stock" and "custom" avatar types use batch synthesis.
            # Custom avatars trained with voice sync set use_built_in_voice=True,
            # which passes useBuiltInVoice=True to the API for in-sync lip movement.
            # For custom (trained) avatars, apply the configured background image
            # if one is set — backgroundImage takes priority over backgroundColor.
            bg_image = (
                settings.CUSTOM_AVATAR_BACKGROUND_IMAGE or None
            ) if avatar.customized else None
            result = await azure_speech.create_batch_synthesis(
                script=payload.script,
                voice_name=avatar.voice_name,
                avatar_character=avatar.avatar_character,
                avatar_style=avatar.avatar_style,
                background_color=payload.background_color or "#FFFFFFFF",
                subtitles=payload.subtitles if payload.subtitles is not None else True,
                customized=avatar.customized,
                use_built_in_voice=avatar.use_built_in_voice,
                background_image_url=bg_image,
            )
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        body = e.response.text[:1000] if e.response is not None else ""
        raise HTTPException(status_code=502, detail=f"Azure Speech API error {e.response.status_code}: {body}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Azure Speech API error: {str(e)}")

    job_id = result.get("id", "unknown")
    preview = payload.script[:100] + ("..." if len(payload.script) > 100 else "")
    job = SynthesisJob(
        job_id=job_id,
        avatar_id=payload.avatar_id,
        avatar_name=avatar.name,
        script_preview=preview,
        status=result.get("status", "Running"),
        video_url=None,
        created_at=datetime.now(timezone.utc),
    )
    JOBS[job_id] = job
    return job


@router.get("/batch/{job_id}", response_model=SynthesisJob)
async def get_batch_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    try:
        result = await azure_speech.get_batch_synthesis_status(job_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Azure Speech API error: {str(e)}")

    status = result.get("status", job.status)
    video_url = result.get("outputs", {}).get("result") if status == "Succeeded" else job.video_url
    updated = job.model_copy(update={"status": status, "video_url": video_url})
    JOBS[job_id] = updated
    return updated


@router.get("/batch", response_model=list[SynthesisJob])
def list_batch_jobs():
    return list(JOBS.values())
