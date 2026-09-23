"""Image description via OpenRouter's free router (openrouter/free).

The chat model is NEVER used for images — vision always goes through
settings.vision_model so image understanding stays free and the chat
persona/model stays exactly as configured.

Note: the free router picks randomly per request, and the pool contains
non-descriptive models (e.g. safety classifiers). We retry a few times
and validate the output looks like an actual description.
"""
import base64
import re

DESCRIBE_PROMPT = (
    "Describe this image in detail for someone who cannot see it. "
    "If it contains text (timetable, document, sign, chart), transcribe ALL of it faithfully, "
    "preserving structure (rows, columns, times, names). Then add a short visual summary. "
    "Be thorough but concise."
)

# safety classifiers / refusals / junk — never accept these as a description
_JUNK_RES = [
    re.compile(r"user\s+safety\s*:", re.I),
    re.compile(r"response\s+safety\s*:", re.I),
    re.compile(r"^\s*(safe|unsafe)\s*$", re.I),
    re.compile(r"i('m| am) (unable|not able) to (see|view|process).{0,80}$", re.I | re.S),
]

def _looks_like_description(text: str) -> bool:
    t = (text or "").strip()
    if len(t) < 60:
        return False
    return not any(p.search(t) for p in _JUNK_RES)

async def describe_image(image_bytes: bytes, mime: str, prompt: str | None = None, tries: int = 5) -> dict:
    from app.config import settings
    if not settings.openrouter_api_key:
        return {"ok": False, "error": "no_openrouter_key", "text": ""}
    try:
        from openai import AsyncOpenAI
    except ImportError:
        return {"ok": False, "error": "openai package not installed", "text": ""}
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime or 'image/png'};base64,{b64}"
    client = AsyncOpenAI(
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={"HTTP-Referer": "http://localhost:5173", "X-Title": "Compangine Neural Cloud"},
    )
    try:
        last_err = "empty_response"
        used_model = settings.vision_model
        # pass 1: the free router (random free model per request)
        for _ in range(max(1, tries)):
            text, used_model = await _attempt(client, settings.vision_model or "openrouter/free", data_url, prompt)
            if _looks_like_description(text):
                return {"ok": True, "text": text, "model": used_model}
            last_err = "weak_response"
        # pass 2: pinned free VLM fallback (the router pool sometimes skews
        # to non-descriptive models like safety classifiers)
        fb = (settings.vision_fallback_model or "").strip()
        if fb and fb != (settings.vision_model or ""):
            text, used_model = await _attempt(client, fb, data_url, prompt)
            if _looks_like_description(text):
                return {"ok": True, "text": text, "model": used_model}
            last_err = "weak_response_fallback"
        return {"ok": False, "error": last_err, "text": "", "model": used_model}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300], "text": ""}


async def _attempt(client, model: str, data_url: str, prompt: str | None):
    resp = await client.chat.completions.create(
        model=model,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt or DESCRIBE_PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }],
        temperature=0.2,
        max_tokens=800,
        extra_body={"reasoning": {"exclude": True}},
    )
    used = getattr(resp, "model", None) or model
    return (resp.choices[0].message.content or "").strip(), used
