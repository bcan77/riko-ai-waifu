from fastapi import APIRouter
from pydantic import BaseModel
from app.config import settings
import json, os
from pathlib import Path

router = APIRouter()

KEYS_FILE = Path(__file__).resolve().parent.parent.parent / "user_keys.json"

def _load_persisted():
    if KEYS_FILE.exists():
        try:
            data = json.loads(KEYS_FILE.read_text(encoding="utf-8"))
            for k in ("openrouter_api_key","groq_api_key","elevenlabs_api_key","fish_api_key"):
                if k in data and data[k]:
                    setattr(settings, k, data[k])
            if "openrouter_model" in data and data["openrouter_model"]:
                settings.openrouter_model = str(data["openrouter_model"]).strip() or settings.openrouter_model
        except Exception:
            pass

# load on import
try: _load_persisted()
except Exception: pass

def _masked(v: str | None) -> str | None:
    if not v: return None
    s = str(v)
    if len(s) <= 8: return "••••" + s[-2:]
    return s[:4] + "••••" + s[-4:]

class KeysIn(BaseModel):
    openrouter_api_key: str | None = None
    groq_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    fish_api_key: str | None = None
    openrouter_model: str | None = None

@router.get("/api/keys")
async def get_keys():
    return {
        "has_openrouter": bool(settings.openrouter_api_key),
        "has_groq": bool(settings.groq_api_key),
        "has_elevenlabs": bool(settings.elevenlabs_api_key),
        "has_fish": bool(settings.fish_api_key),
        "openrouter_masked": _masked(settings.openrouter_api_key),
        "groq_masked": _masked(settings.groq_api_key),
        "elevenlabs_masked": _masked(settings.elevenlabs_api_key),
        "fish_masked": _masked(settings.fish_api_key),
        "llm_provider": settings.llm_provider,
        "tts_provider": settings.tts_provider,
        "openrouter_model": settings.openrouter_model,
    }

@router.post("/api/keys")
async def set_keys(body: KeysIn):
    data = {}
    if KEYS_FILE.exists():
        try: data = json.loads(KEYS_FILE.read_text(encoding="utf-8"))
        except: data = {}
    updated = []
    for field in ("openrouter_api_key","groq_api_key","elevenlabs_api_key","fish_api_key"):
        val = getattr(body, field)
        if val is not None:
            v = val.strip()
            # empty string means clear
            if v == "":
                setattr(settings, field, None)
                data[field] = ""
                updated.append(field)
            else:
                setattr(settings, field, v)
                data[field] = v
                updated.append(field)
    # openrouter model (optional)
    if body.openrouter_model is not None:
        v = body.openrouter_model.strip()
        if v:
            settings.openrouter_model = v
            data["openrouter_model"] = v
            updated.append("openrouter_model")
        else:
            # don't clear to None — keep existing, but persist empty as no-op
            pass
    try:
        KEYS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "updated": updated, "has_openrouter": bool(settings.openrouter_api_key), "has_groq": bool(settings.groq_api_key), "has_elevenlabs": bool(settings.elevenlabs_api_key), "openrouter_model": settings.openrouter_model}
