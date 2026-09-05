from app.config import settings
from .groq import GroqProvider
from .openrouter import OpenRouterProvider
from .base import LLMProvider
from typing import AsyncIterator
import asyncio, json
from .prompts import parse_llm_json

def build_provider(name: str, model_override: str | None = None) -> LLMProvider | None:
    name = (name or "").lower()
    if name == "groq" and settings.groq_api_key:
        model = model_override.strip() if isinstance(model_override, str) and model_override.strip() else settings.groq_model
        return GroqProvider(settings.groq_api_key, model)
    if name == "openrouter" and settings.openrouter_api_key:
        model = model_override.strip() if isinstance(model_override, str) and model_override.strip() else settings.openrouter_model
        return OpenRouterProvider(settings.openrouter_api_key, model)
    return None

def get_llm_providers(model_override: str | None = None) -> tuple[LLMProvider | None, LLMProvider | None]:
    # model_override only applies to OpenRouter; Groq keeps its own model
    openrouter_override = model_override if settings.llm_provider == "openrouter" or settings.llm_fallback == "openrouter" else None
    primary = build_provider(settings.llm_provider, model_override=openrouter_override if settings.llm_provider=="openrouter" else None)
    fallback = None
    if settings.llm_fallback != "none" and settings.llm_fallback != settings.llm_provider:
        fallback = build_provider(settings.llm_fallback, model_override=openrouter_override if settings.llm_fallback=="openrouter" else None)
    # if primary missing key, swap
    if primary is None and fallback is not None:
        primary, fallback = fallback, None
    return primary, fallback

_OPENROUTER_FALLBACK_MODELS = [
    "minimax/minimax-m3:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
]

async def stream_with_fallback(messages: list[dict], model_override: str | None = None) -> AsyncIterator[str]:
    """
    Streams from primary (OpenRouter), on failure/timeout falls back to Groq,
    then to alternate OpenRouter free models (resilient to 429 shared-pool).
    Also provides mock fallback if no keys configured (so frontend still works offline).
    """
    primary, fallback = get_llm_providers(model_override=model_override)
    if primary is None and fallback is None:
        mock = '{"text": "Hello! I am online — configure OPENROUTER_API_KEY or GROQ_API_KEY to enable real LLM.", "emotion": "happy", "gesture": "wave", "intensity": 0.8}'
        for ch in mock:
            yield ch
            await asyncio.sleep(0.005)
        return

    last_err: Exception | None = None
    try:
        got_first = False
        async for tok in primary.stream_chat(messages):  # type: ignore
            got_first = True
            yield tok
        if got_first:
            return
        raise RuntimeError("primary returned no tokens")
    except Exception as e:
        last_err = e
        if fallback is not None:
            try:
                async for tok in fallback.stream_chat(messages):  # type: ignore
                    yield tok
                return
            except Exception as e2:
                last_err = e2

        # tertiary: try alternate OpenRouter free models if primary was OpenRouter
        # this handles 429 rate-limit on shared free tier without requiring Groq key
        if settings.openrouter_api_key and settings.llm_provider == "openrouter":
            for alt_model in _OPENROUTER_FALLBACK_MODELS:
                if alt_model == getattr(primary, "model", None):
                    continue
                try:
                    from .openrouter import OpenRouterProvider
                    alt = OpenRouterProvider(settings.openrouter_api_key, alt_model)
                    got_first = False
                    async for tok in alt.stream_chat(messages):
                        got_first = True
                        yield tok
                    if got_first:
                        return
                except Exception as e3:
                    last_err = e3
                    continue
        if last_err:
            raise last_err
        raise

async def complete_with_fallback(messages: list[dict], model_override: str | None = None) -> dict:
    primary, fallback = get_llm_providers(model_override=model_override)
    if primary is None and fallback is None:
        return {"text": "Hello! Configure API keys for real LLM.", "emotion": "happy", "gesture": "wave", "intensity": 0.8}
    try:
        # try streaming parse first
        buf = ""
        async for tok in stream_with_fallback(messages, model_override=model_override):
            buf += tok
        return parse_llm_json(buf)
    except Exception:
        return {"text": "Sorry, LLM unavailable.", "emotion": "sad", "gesture": "none", "intensity": 0.5}
