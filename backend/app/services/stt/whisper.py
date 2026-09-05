"""
Whisper STT — faster-whisper small (244MB, best accuracy) with graceful fallback.
If faster-whisper not installed or model not downloaded, returns empty and client falls back to Web Speech API.
"""
import asyncio, os
from typing import AsyncIterator

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")  # small = best accuracy per user req

class WhisperSTT:
    def __init__(self, model: str = MODEL_NAME):
        self.model_name = model
        self._model = None
        self._has = False
        try:
            from faster_whisper import WhisperModel  # type: ignore
            self._has = True
        except Exception:
            self._has = False

    def available(self) -> bool:
        return self._has

    async def transcribe(self, pcm_bytes: bytes, lang: str | None = None) -> str:
        if not self._has:
            return ""
        # lazy load
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
                self._model = WhisperModel(self.model_name, device="cpu", compute_type="int8")
            except Exception as e:
                print(f"[whisper] load failed {e}")
                return ""
        # pcm16 16k mono bytes -> transcribe
        import tempfile, wave
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            path = tmp.name
        try:
            import wave
            with wave.open(path, "wb") as wf:
                wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(16000)
                wf.writeframes(pcm_bytes)
            segments, info = self._model.transcribe(path, language=lang, beam_size=1, vad_filter=True)
            text = "".join(s.text for s in segments).strip()
            return text
        finally:
            try: os.unlink(path)
            except: pass

whisper_stt = WhisperSTT()
