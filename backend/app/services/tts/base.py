from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Optional

@dataclass
class Phoneme:
    phoneme: str
    start: float  # seconds
    end: float

@dataclass
class TTSAudioChunk:
    audio: bytes          # PCM16 mono 24k or mp3
    sample_rate: int = 24000
    encoding: str = "pcm16"  # pcm16 | mp3 | opus
    phonemes: Optional[list[Phoneme]] = None
    t_start: float = 0.0
    t_end: float = 0.0

class TTSProvider(ABC):
    @abstractmethod
    async def synthesize_stream(self, text: str, voice_id: str | None = None, lang_hint: str | None = None) -> AsyncIterator[TTSAudioChunk]:
        ...

    def supports_streaming(self) -> bool:
        return True
