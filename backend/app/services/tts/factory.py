from app.config import settings
from .base import TTSProvider
from .kokoro import KokoroProvider
from .elevenlabs import ElevenLabsProvider
from .fish import FishProvider

def get_tts_provider(premium: bool = False) -> TTSProvider:
    # premium flag: use whichever premium key is available regardless of tts_premium env
    if premium:
        if settings.elevenlabs_api_key:
            # respect explicit tts_premium=fish to prefer fish, else default to elevenlabs
            if settings.tts_premium != "fish":
                return ElevenLabsProvider(settings.elevenlabs_api_key, settings.elevenlabs_voice_id, settings.elevenlabs_model)
        if settings.fish_api_key:
            return FishProvider(settings.fish_api_key, settings.fish_voice_id)
        if settings.tts_premium == "elevenlabs" and settings.elevenlabs_api_key:
            return ElevenLabsProvider(settings.elevenlabs_api_key, settings.elevenlabs_voice_id, settings.elevenlabs_model)
        if settings.tts_premium == "fish":
            return FishProvider(settings.fish_api_key, settings.fish_voice_id)

    # env-based selection
    if settings.tts_provider == "elevenlabs" and settings.elevenlabs_api_key:
        return ElevenLabsProvider(settings.elevenlabs_api_key, settings.elevenlabs_voice_id, settings.elevenlabs_model)
    if settings.tts_provider == "fish":
        return FishProvider(settings.fish_api_key, settings.fish_voice_id)
    # default kokoro (works offline, mocked as silence if not installed)
    return KokoroProvider()

def get_tts_for_request(premium: bool, voice_id: str | None = None) -> TTSProvider:
    return get_tts_provider(premium=premium)
