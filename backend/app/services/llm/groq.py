from .base import LLMProvider
from typing import AsyncIterator
import json

class GroqProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from groq import AsyncGroq
            except ImportError as e:
                raise RuntimeError("groq package not installed. pip install groq") from e
            self._client = AsyncGroq(api_key=self.api_key)
        return self._client

    async def stream_chat(self, messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
        client = self._get_client()
        m = model or self.model
        stream = await client.chat.completions.create(
            model=m,
            messages=messages,
            temperature=0.7,
            max_tokens=256,
            stream=True,
            response_format={"type": "json_object"},
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def complete_json(self, messages: list[dict], model: str | None = None) -> dict:
        client = self._get_client()
        m = model or self.model
        resp = await client.chat.completions.create(
            model=m,
            messages=messages,
            temperature=0.7,
            max_tokens=256,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
        return json.loads(raw)
