from .base import TTSProvider, TTSAudioChunk, Phoneme
from typing import AsyncIterator
import asyncio, base64

class ElevenLabsProvider(TTSProvider):
    def __init__(self, api_key: str, voice_id: str, model: str = "eleven_multilingual_v2"):
        self.api_key = api_key
        self.voice_id = voice_id
        self.model = model

    async def synthesize_stream(self, text: str, voice_id: str | None = None, lang_hint: str | None = None) -> AsyncIterator[TTSAudioChunk]:
        vid = (voice_id or self.voice_id).replace("kokoro-", "")
        # try real elevenlabs SDK, else mock
        try:
            from elevenlabs import AsyncElevenLabs  # type: ignore
            client = AsyncElevenLabs(api_key=self.api_key)
            # elevenlabs streaming returns audio bytes; no phoneme timestamps — we synthesize
            stream = client.text_to_speech.stream(
                text=text,
                voice_id=vid,
                model_id=self.model,
                output_format="pcm_24000",
            )
            buf = b""
            t_cursor = 0.0
            # collect all first then chunk (elevenlabs streams mp3-like chunks)
            async for chunk in stream:
                if isinstance(chunk, bytes):
                    buf += chunk
            if not buf:
                raise RuntimeError("empty elevenlabs audio")
            # assume pcm16 24k
            dur = len(buf) / 2 / 24000
            # crude decode if mp3: we treat as pcm for viseme sync
            from .kokoro import KokoroProvider
            mock = KokoroProvider()
            phonemes = mock._synthetic_phonemes(text, 0, dur)
            # emit in ~0.3s chunks
            chunk_dur = 0.3
            bytes_per_sec = 24000*2
            step = int(chunk_dur*bytes_per_sec)
            idx = 0
            for off in range(0, len(buf), step):
                c = buf[off:off+step]
                cdur = len(c)/bytes_per_sec
                # slice phonemes for this window
                ph_slice = [p for p in phonemes if p.start < (idx+1)*chunk_dur and p.end > idx*chunk_dur]
                yield TTSAudioChunk(audio=c, sample_rate=24000, encoding="pcm16", phonemes=ph_slice, t_start=idx*chunk_dur, t_end=idx*chunk_dur+cdur)
                idx += 1
                await asyncio.sleep(0)
            return
        except Exception as e:
            # graceful mock so viseme pipeline still works even without key/sdk
            from .kokoro import KokoroProvider
            kokoro = KokoroProvider()
            async for ch in kokoro.synthesize_stream(text, voice_id=vid, lang_hint=lang_hint):
                yield ch
