from .base import TTSProvider, TTSAudioChunk
from typing import AsyncIterator

class FishProvider(TTSProvider):
    def __init__(self, api_key: str | None = None, voice_id: str | None = None):
        self.api_key = api_key
        self.voice_id = voice_id

    async def synthesize_stream(self, text: str, voice_id: str | None = None, lang_hint: str | None = None) -> AsyncIterator[TTSAudioChunk]:
        # Stub — delegates to Kokoro mock until Fish Speech API wired (same viseme sync)
        from .kokoro import KokoroProvider
        kokoro = KokoroProvider()
        async for ch in kokoro.synthesize_stream(text, voice_id=voice_id, lang_hint=lang_hint):
            yield ch
