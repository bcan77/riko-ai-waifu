from pydantic import BaseModel, Field
from typing import Literal, Optional
import time

Emotion = Literal["neutral","happy","sad","angry","surprised","shy","excited","annoyed"]
Gesture = Literal["none","wave","nod","bow","idle","point","shrug"]

class LLMStructuredOutput(BaseModel):
    text: str = Field(description="Spoken utterance, 1-3 sentences")
    emotion: Emotion = "neutral"
    gesture: Gesture = "none"
    intensity: float = Field(default=0.7, ge=0, le=1)

class ChatRequest(BaseModel):
    text: str
    session_id: str = "default"
    model_id: str = "ellen"  # ellen | jane | zhu — selects voice
    voice_id: Optional[str] = None
    premium: bool = False
    lang_hint: Optional[str] = None  # en | ja | auto
    llm_model: Optional[str] = None  # override OpenRouter model id
    openrouter_model: Optional[str] = None  # alias

# WS protocol message types (server -> client)
# type: llm_start | llm_token | llm_end | tts_start | viseme | audio | animation | done | error | interrupted | pong

class VisemeFrame(BaseModel):
    t: float
    morphs: dict[str, float]  # a,i,u,e,o (+ optional blinking)
    duration: float

class TTSChunk(BaseModel):
    audio_b64: str
    t_start: float
    t_end: float
    chunk_index: int
    sample_rate: int = 24000
    encoding: str = "pcm16"

def now_ms() -> int:
    return int(time.time() * 1000)
