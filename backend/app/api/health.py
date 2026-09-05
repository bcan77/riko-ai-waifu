from fastapi import APIRouter
from app.config import settings
import time

router = APIRouter()

@router.get("/health")
async def health():
    return {
        "ok": True,
        "t": time.time(),
        "llm_provider": settings.llm_provider,
        "llm_fallback": settings.llm_fallback,
        "tts_provider": settings.tts_provider,
        "has_openrouter": bool(settings.openrouter_api_key),
        "has_groq": bool(settings.groq_api_key),
        "has_elevenlabs": bool(settings.elevenlabs_api_key),
        "openrouter_model": settings.openrouter_model,
        "groq_model": settings.groq_model,
    }

@router.get("/api/config")
async def api_config():
    return {
        "llm_provider": settings.llm_provider,
        "llm_fallback": settings.llm_fallback,
        "tts_provider": settings.tts_provider,
        "openrouter_model": settings.openrouter_model,
        "groq_model": settings.groq_model,
        "cors_origins": settings.cors_origins_list,
    }
