from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    openrouter_api_key: str | None = None
    openrouter_model: str = "poolside/laguna-s-2.1:free"
    groq_api_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    llm_provider: Literal["openrouter", "groq"] = "openrouter"
    llm_fallback: Literal["openrouter", "groq", "none"] = "groq"
    llm_timeout_s: int = 8

    # TTS
    tts_provider: Literal["kokoro", "elevenlabs", "fish"] = "kokoro"
    tts_premium: Literal["none", "elevenlabs", "fish"] = "none"
    kokoro_lang: str = "auto"
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_model: str = "eleven_multilingual_v2"
    fish_api_key: str | None = None
    fish_voice_id: str | None = None

    voice_ellen: str = "kokoro-af_sky"
    voice_jane: str = "kokoro-af_bella"
    voice_zhu: str = "kokoro-af_nicole"

    # Memory/STT
    whisper_model: str = "small"
    chroma_dir: str = "memory/chroma"

    # Server
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    ws_heartbeat_s: int = 20
    log_level: str = "info"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

settings = Settings()
