from abc import ABC, abstractmethod
from typing import AsyncIterator

class LLMChunk(ABC): pass

class TextChunk(LLMChunk):
    def __init__(self, token: str):
        self.token = token

class LLMProvider(ABC):
    @abstractmethod
    async def stream_chat(self, messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
        """Yield raw text tokens (already decoded). Caller parses JSON incrementally."""
        ...

    @abstractmethod
    async def complete_json(self, messages: list[dict], model: str | None = None) -> dict:
        """Non-streaming fallback returning parsed dict."""
        ...
