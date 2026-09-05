from fastapi import APIRouter, Request
from pathlib import Path
import json, math, re

router = APIRouter()

SETTINGS_FILE = Path(__file__).resolve().parent.parent.parent / "user_settings.json"

# Mirrors waifu-viewer/src/settings/store.js DEFAULTS (sanitized)
DEFAULTS = {
    "version": 9,
    "modelId": "ellen",
    "outfitId": "default",
    "affinity": 0.5,
    "animId": "default_pose",
    "speed": 1,
    "loop": True,
    "mirror": False,
    "physics": True,
    "ik": True,
    "gravity": -18,
    "eyeTracking": True,
    "hitboxing": True,
    "keyIntensity": 1.10,
    "fillIntensity": 0.42,
    "rimIntensity": 0.38,
    "backIntensity": 0.18,
    "ambientIntensity": 0.58,
    "exposure": 0.96,
    "shadows": True,
    "ground": True,
    "dprCap": "auto",
    "shadowRes": "auto",
    "fpsCap": 0,
    "fov": 38,
    "autoRotate": False,
    "dampingFactor": 0.065,
    "minDistance": 4,
    "maxDistance": 50,
    "maxPolarAngle": math.pi * 0.495,
    "minPolarAngle": 0.08,
    "ttsVoiceEn": "af_sky",
    "ttsVoiceJa": "jf_alpha",
    "premium": False,
    "sttLang": "auto",
    "bargeIn": True,
    "prosodyRate": 1,
    "prosodyPitch": 0,
    "panelCollapsed": True,
    "theme": "dark",
    "onboarded": False,
    "backgroundId": "Cozy-Living-Room",
    "backgroundBlur": 0,
}

def _clamp(n, lo, hi):
    try:
        v = float(n)
    except:
        return lo
    return max(lo, min(hi, v))

def sanitize(raw: dict) -> dict:
    if not isinstance(raw, dict):
        return dict(DEFAULTS)
    o = {}
    # version
    try: o["version"] = int(raw.get("version", DEFAULTS["version"]))
    except: o["version"] = DEFAULTS["version"]
    # characters
    o["modelId"] = raw.get("modelId") if raw.get("modelId") in ("ellen","jane","zhu") else DEFAULTS["modelId"]
    _oid = raw.get("outfitId")
    o["outfitId"] = _oid if isinstance(_oid, str) and re.match(r"^[a-z0-9_-]{1,32}$", _oid) else DEFAULTS["outfitId"]
    o["affinity"] = _clamp(raw.get("affinity", DEFAULTS["affinity"]), 0, 1)
    o["animId"] = raw.get("animId") if isinstance(raw.get("animId"), str) and raw.get("animId") else DEFAULTS["animId"]
    o["speed"] = _clamp(raw.get("speed", DEFAULTS["speed"]), 0.1, 2)
    o["loop"] = bool(raw["loop"]) if "loop" in raw else DEFAULTS["loop"]
    o["mirror"] = bool(raw.get("mirror", DEFAULTS["mirror"]))
    o["physics"] = bool(raw["physics"]) if "physics" in raw else DEFAULTS["physics"]
    o["ik"] = bool(raw["ik"]) if "ik" in raw else DEFAULTS["ik"]
    o["gravity"] = _clamp(raw.get("gravity", DEFAULTS["gravity"]), -40, 0)
    o["eyeTracking"] = raw.get("eyeTracking", DEFAULTS["eyeTracking"]) is not False
    o["hitboxing"] = raw.get("hitboxing", DEFAULTS["hitboxing"]) is not False
    o["keyIntensity"] = _clamp(raw.get("keyIntensity", DEFAULTS["keyIntensity"]), 0, 5)
    o["fillIntensity"] = _clamp(raw.get("fillIntensity", DEFAULTS["fillIntensity"]), 0, 2)
    o["rimIntensity"] = _clamp(raw.get("rimIntensity", DEFAULTS["rimIntensity"]), 0, 3)
    o["backIntensity"] = _clamp(raw.get("backIntensity", DEFAULTS["backIntensity"]), 0, 2)
    o["ambientIntensity"] = _clamp(raw.get("ambientIntensity", DEFAULTS["ambientIntensity"]), 0, 1.5)
    o["exposure"] = _clamp(raw.get("exposure", DEFAULTS["exposure"]), 0.3, 2)
    o["shadows"] = raw.get("shadows", DEFAULTS["shadows"]) is not False
    o["ground"] = raw.get("ground", DEFAULTS["ground"]) is not False
    o["dprCap"] = str(raw.get("dprCap")) if str(raw.get("dprCap")) in ("auto","1.25","1.5","1.75","2") else DEFAULTS["dprCap"]
    o["shadowRes"] = str(raw.get("shadowRes")) if str(raw.get("shadowRes")) in ("auto","1024","2048") else DEFAULTS["shadowRes"]
    try:
        fps = int(raw.get("fpsCap", DEFAULTS["fpsCap"]))
        o["fpsCap"] = fps if fps in (0,30,60) else DEFAULTS["fpsCap"]
    except: o["fpsCap"] = DEFAULTS["fpsCap"]
    o["fov"] = _clamp(raw.get("fov", DEFAULTS["fov"]), 20, 75)
    o["autoRotate"] = bool(raw.get("autoRotate", DEFAULTS["autoRotate"]))
    o["dampingFactor"] = _clamp(raw.get("dampingFactor", DEFAULTS["dampingFactor"]), 0.01, 0.2)
    o["minDistance"] = _clamp(raw.get("minDistance", DEFAULTS["minDistance"]), 1, 20)
    o["maxDistance"] = _clamp(raw.get("maxDistance", DEFAULTS["maxDistance"]), 10, 80)
    o["maxPolarAngle"] = _clamp(raw.get("maxPolarAngle", DEFAULTS["maxPolarAngle"]), 0.5, math.pi)
    o["minPolarAngle"] = _clamp(raw.get("minPolarAngle", DEFAULTS["minPolarAngle"]), 0, 0.5)
    o["ttsVoiceEn"] = raw.get("ttsVoiceEn") if isinstance(raw.get("ttsVoiceEn"), str) and raw.get("ttsVoiceEn") else DEFAULTS["ttsVoiceEn"]
    o["ttsVoiceJa"] = raw.get("ttsVoiceJa") if isinstance(raw.get("ttsVoiceJa"), str) and raw.get("ttsVoiceJa") else DEFAULTS["ttsVoiceJa"]
    o["premium"] = bool(raw.get("premium", DEFAULTS["premium"]))
    o["sttLang"] = raw.get("sttLang") if raw.get("sttLang") in ("auto","en-US","ja-JP") else DEFAULTS["sttLang"]
    o["bargeIn"] = raw.get("bargeIn", DEFAULTS["bargeIn"]) is not False
    o["prosodyRate"] = _clamp(raw.get("prosodyRate", DEFAULTS["prosodyRate"]), 0.7, 1.4)
    o["prosodyPitch"] = _clamp(raw.get("prosodyPitch", DEFAULTS["prosodyPitch"]), -6, 6)
    o["panelCollapsed"] = bool(raw.get("panelCollapsed", DEFAULTS["panelCollapsed"])) if isinstance(raw.get("panelCollapsed"), bool) else (raw.get("panelCollapsed") is not False)
    o["theme"] = raw.get("theme") if isinstance(raw.get("theme"), str) else DEFAULTS["theme"]
    o["onboarded"] = bool(raw.get("onboarded", DEFAULTS["onboarded"]))
    # openrouterModel is stored via keys file but also allow here for sync
    if isinstance(raw.get("openrouterModel"), str) and raw.get("openrouterModel").strip():
        o["openrouterModel"] = raw.get("openrouterModel").strip()
    o["backgroundId"] = raw.get("backgroundId") if isinstance(raw.get("backgroundId"), str) and raw.get("backgroundId") else DEFAULTS["backgroundId"]
    o["backgroundBlur"] = _clamp(raw.get("backgroundBlur", DEFAULTS["backgroundBlur"]), 0, 20)
    return o

def _load_file():
    if not SETTINGS_FILE.exists():
        return None
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        return sanitize(data)
    except Exception:
        return None

@router.get("/api/settings")
async def get_settings():
    data = _load_file()
    if data is None:
        data = dict(DEFAULTS)
    return {"ok": True, "settings": data}

@router.post("/api/settings")
async def set_settings(req: Request):
    try:
        body = await req.json()
    except Exception as e:
        return {"ok": False, "error": f"invalid JSON: {e}"}
    # allow either {settings:{...}} or flat {...}
    raw = body.get("settings") if isinstance(body.get("settings"), dict) else body
    # merge with existing file so partial patches preserve other fields
    existing = _load_file()
    if existing is None:
        existing = dict(DEFAULTS)
    # sanitize merge
    merged = sanitize({**existing, **(raw if isinstance(raw, dict) else {})})
    try:
        SETTINGS_FILE.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    except Exception as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "settings": merged}
