from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from app.config import settings
from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.wpkg import router as wpkg_router
from app.api.memory import router as memory_router
from app.api.keys import router as keys_router
from app.api.settings import router as settings_router
from app.api.backgrounds import router as backgrounds_router
from app.api.version import router as version_router
from app.api.content import router as content_router
from app.api.cloud import router as cloud_router
from app.ws.talk import router as ws_router
import logging
from pathlib import Path
import json
import mimetypes
from app.paths import repo_root, pack_candidates

def _app_version():
    for p in [Path(__file__).resolve().parent.parent.parent / "VERSION", Path(__file__).resolve().parent.parent.parent.parent / "VERSION", Path("VERSION"), Path("version.json")]:
        try:
            if p.exists():
                t = p.read_text().strip()
                if p.suffix=='.json':
                    t = json.loads(t).get("version", t)
                if t: return t.split()[0]
        except: pass
    return "0.2.0"

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))

app = FastAPI(title="Compangine Engine", version=_app_version())

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(wpkg_router)
app.include_router(memory_router)
app.include_router(keys_router)
app.include_router(settings_router)
app.include_router(backgrounds_router)
app.include_router(version_router)
app.include_router(content_router)
app.include_router(cloud_router)
app.include_router(ws_router)

# --- Serve /backgrounds/* static files from project backgrounds/ (and public/backgrounds fallback) ---
# This makes FBX + textures accessible when the frontend is served via dist or via Vite proxy
try:
    # main.py lives at backend/app/main.py -> project root is 3 levels up (.. / .. / ..)
    # backgrounds.py uses 4 levels because it's at backend/app/api/backgrounds.py (one deeper)
    # RIKO_ROOT overrides both when the engine runs packaged.
    _ROOT = repo_root()
    _BG_CANDIDATES = pack_candidates("backgrounds", "backgrounds")
    _BG_SRC = _BG_CANDIDATES[0]
    _PUBLIC_BG = _ROOT / "waifu-viewer" / "public" / "backgrounds"
    _DIST_BG = _ROOT / "waifu-viewer" / "dist" / "backgrounds"
    _BG_BASES = []
    for _b in [*_BG_CANDIDATES, _PUBLIC_BG, _DIST_BG]:
        if _b not in _BG_BASES:
            _BG_BASES.append(_b)
    # Legacy PMX models — same candidate scheme (user content first, repo second).
    # This is what makes /models/* work when the frontend dist ships slim.
    _MODEL_BASES = [*pack_candidates("models", str(Path("waifu-viewer") / "public" / "models")),
                    _ROOT / "waifu-viewer" / "dist" / "models"]
    # We implement a custom route instead of a plain StaticFiles mount so we can probe
    # BG_SRC first, then PUBLIC_BG/dist — and handle FBX .fbm texture fallback.
    from fastapi import Request
    from urllib.parse import unquote

    def _find_texture_tolerant(fname: str):
        # tolerant texture lookup: exact, jpg<->jpeg swap, stem search
        alt = None
        low = fname.lower()
        if low.endswith('.jpg'):
            alt = fname[:-4] + '.jpeg'
            alt2 = fname[:-4] + '.JPEG'
        elif low.endswith('.jpeg'):
            alt = fname[:-5] + '.jpg'
            alt2 = fname[:-5] + '.JPG'
        else:
            alt2 = None
        probes = [fname]
        if alt: probes.append(alt)
        # also try alternate case for first char if Cyrillic? just do rglob fallback later
        for base in _BG_BASES:
            for q in probes:
                for probe in [base / "Cozy-Living-Room" / "textures" / q, base / "textures" / q, base / q]:
                    if probe.is_file():
                        return probe
        # stem fallback: search by stem regardless of ext
        stem = Path(fname).stem.lower()
        for base in _BG_BASES:
            if not base.exists(): continue
            for found in base.rglob("*"):
                if found.is_file() and found.stem.lower() == stem:
                    # prefer exact ext match first, but stem match is ok for jpg/jpeg interchange
                    if found.suffix.lower() in (".jpg",".jpeg",".png",".tga",".bmp",".webp"):
                        return found
        return None

    @app.get("/backgrounds/{full_path:path}")
    async def serve_background_file(full_path: str, request: Request):
        # decode URL-encoded Cyrillic/spaces
        rel = unquote(full_path)
        # prevent traversal
        if ".." in rel or "\0" in rel:
            return FileResponse(status_code=400)
        candidates = []
        for base in _BG_BASES:
            p = base / rel
            if p.is_file():
                candidates.append(p)
                break
        # fallback: texture requested via "2.fbm/<name>" or "source/2.fbm/<name>" — map to textures/<name>
        if not candidates and (".fbm" in rel or "textures" in rel.lower()):
            fname = Path(rel).name
            found = _find_texture_tolerant(fname)
            if found: candidates.append(found)
        # also try: if rel is "Cozy-Living-Room/source/2.fbm/X" -> textures/X
        if not candidates and ".fbm" in rel:
            fname = Path(rel).name
            found = _find_texture_tolerant(fname)
            if found: candidates.append(found)
        if not candidates:
            # last resort: search by filename anywhere under backgrounds (exact then tolerant)
            fname = Path(rel).name
            for base in _BG_CANDIDATES:
                for found in base.rglob(fname):
                    if found.is_file():
                        candidates.append(found)
                        break
                if candidates:
                    break
            if not candidates:
                tol = _find_texture_tolerant(fname)
                if tol: candidates.append(tol)
        if not candidates:
            # For missing optional textures (roughness/metallic) return 204 so FBX still loads without 404 JSON noise
            low = rel.lower()
            if any(k in low for k in ["roughness","metallic"]):
                from fastapi.responses import Response
                return Response(status_code=204, headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"})
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": f"background not found: {rel}"}, status_code=404)
        fpath = candidates[0]
        media = mimetypes.guess_type(str(fpath))[0] or "application/octet-stream"
        # special for FBX
        if fpath.suffix.lower() == ".fbx":
            media = "application/octet-stream"
        return FileResponse(str(fpath), media_type=media, headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"})
except Exception as e:
    logging.getLogger(__name__).warning(f"[backgrounds] static mount failed: {e}")

# --- Serve /models/* (legacy PMX) from user content or repo layout ---
# Lets the frontend dist ship slim: models install as a content pack.
try:
    @app.get("/models/{full_path:path}")
    async def serve_model_file(full_path: str):
        from urllib.parse import unquote
        rel = unquote(full_path)
        if ".." in rel or "\0" in rel or rel.startswith("/"):
            return JSONResponse({"detail": "bad path"}, status_code=400)
        for base in _MODEL_BASES:
            p = base / rel
            try:
                if p.is_file():
                    media = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
                    if p.suffix.lower() in (".pmx", ".pmd", ".vmd"):
                        media = "application/octet-stream"
                    return FileResponse(str(p), media_type=media, headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"})
            except Exception:
                continue
        return JSONResponse({"detail": f"model not found: {rel} — install the models content pack"}, status_code=404)
except Exception as e:
    logging.getLogger(__name__).warning(f"[models] static mount failed: {e}")

@app.get("/")
async def root():
    return {"ok": True, "name": "Compangine Engine", "ws": "/ws/talk", "health": "/health"}
