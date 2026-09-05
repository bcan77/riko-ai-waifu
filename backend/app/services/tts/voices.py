"""
Per-character voice mapping. Kokoro voice ids:
  EN: af_bella, af_sky, af_nicole, af_sarah, am_adam, am_michael
  JA: jf_alpha, jf_gongitsune, jf_nezumi, jf_sakura, jm_kumo
We map model_id -> (en_voice, ja_voice)
"""
from app.config import settings
import re

VOICE_MAP = {
    "ellen": ("af_sky", "jf_alpha"),        # cool energetic
    "jane": ("af_bella", "jf_gongitsune"),  # sultry
    "zhu": ("af_nicole", "jf_sakura"),      # calm
}

# allow env overrides
def resolve_voice(model_id: str, voice_override: str | None = None, lang_hint: str | None = None) -> tuple[str, str]:
    if voice_override:
        # voice_override may be like "kokoro-af_bella" or raw
        v = voice_override.replace("kokoro-", "").replace("kokoro:", "")
        return v, detect_lang(lang_hint or v)

    mid = (model_id or "ellen").lower()
    en_v, ja_v = VOICE_MAP.get(mid, VOICE_MAP["ellen"])

    # env overrides
    if mid == "ellen" and settings.voice_ellen:
        raw = settings.voice_ellen.replace("kokoro-", "")
        if "jf" in raw or "jm" in raw:
            ja_v = raw
        else:
            en_v = raw
    elif mid == "jane" and settings.voice_jane:
        raw = settings.voice_jane.replace("kokoro-", "")
        if "jf" in raw or "jm" in raw:
            ja_v = raw
        else:
            en_v = raw
    elif mid == "zhu" and settings.voice_zhu:
        raw = settings.voice_zhu.replace("kokoro-", "")
        if "jf" in raw or "jm" in raw:
            ja_v = raw
        else:
            en_v = raw

    lang = detect_lang(lang_hint)
    voice = ja_v if lang == "ja" else en_v
    return voice, lang

_JA_RE = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")

def detect_lang(hint: str | None, text: str | None = None) -> str:
    if hint in ("ja", "en"):
        return hint
    if hint and _JA_RE.search(hint):
        return "ja"
    if text and _JA_RE.search(text):
        return "ja"
    if hint == "auto" or hint is None:
        if text and _JA_RE.search(text):
            return "ja"
        return "en"
    return "en"

def is_japanese(text: str) -> bool:
    return bool(_JA_RE.search(text))
