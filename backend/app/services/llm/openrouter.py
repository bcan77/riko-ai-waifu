from .base import LLMProvider
from typing import AsyncIterator
import json

class OpenRouterProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from openai import AsyncOpenAI
            except ImportError as e:
                raise RuntimeError("openai package not installed. pip install openai") from e
            self._client = AsyncOpenAI(
                api_key=self.api_key,
                base_url="https://openrouter.ai/api/v1",
                default_headers={
                    "HTTP-Referer": "http://localhost:5173",
                    "X-Title": "MMD Waifu Viewer",
                },
            )
        return self._client

    def _extra_body(self, model: str) -> dict:
        # permanent fix: never surface chain-of-thought — reasoning stays internal
        body: dict = {"reasoning": {"exclude": True}}
        if "openai" not in model:
            body["response_format"] = {"type": "json_object"}
        return body

    async def stream_chat(self, messages: list[dict], model: str | None = None) -> AsyncIterator[str]:
        client = self._get_client()
        m = model or self.model
        stream = await client.chat.completions.create(
            model=m,
            messages=messages,
            temperature=0.7,
            max_tokens=256,
            stream=True,
            extra_body=self._extra_body(m),
        )
        async for chunk in stream:
            # OpenRouter reasoning models may put chain-of-thought in a separate field —
            # we exclude it via reasoning:exclude, but guard anyway
            try:
                # delta may have reasoning field — ignore it
                delta = chunk.choices[0].delta
                content = getattr(delta, "content", None)
                if content:
                    yield content
                # explicitly ignore delta.reasoning if present
            except Exception:
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
            extra_body=self._extra_body(m),
        )
        raw = resp.choices[0].message.content or "{}"
        try:
            return json.loads(raw)
        except Exception:
            from .prompts import parse_llm_json
            return parse_llm_json(raw)
