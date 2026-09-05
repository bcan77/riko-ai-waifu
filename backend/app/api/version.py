from fastapi import APIRouter
from pathlib import Path
import json
import time

router = APIRouter()

ROOT = Path(__file__).resolve().parent.parent.parent.parent  # project root
VERSION_FILE = ROOT / "VERSION"
VERSION_JSON = ROOT / "version.json"

# track source mtimes to report staleness
WATCH_DIRS = [
    ROOT / "waifu-viewer" / "src",
    ROOT / "backend" / "app",
    ROOT / "backgrounds",
    ROOT / "characters",
]

def _read_version():
    try:
        if VERSION_FILE.exists():
            return VERSION_FILE.read_text().strip()
    except: pass
    try:
        if VERSION_JSON.exists():
            j = json.loads(VERSION_JSON.read_text())
            return j.get("version","0.0.0")
    except: pass
    return "0.0.0"

def _read_version_json():
    try:
        if VERSION_JSON.exists():
            return json.loads(VERSION_JSON.read_text())
    except: pass
    return {"version": _read_version(), "build":0, "commit":"unknown", "buildTime": None}

def _needs_rebuild():
    """Check if any source file is newer than version.json buildTime."""
    try:
        if not VERSION_JSON.exists():
            return True
        build_mtime = VERSION_JSON.stat().st_mtime
        # also check waifu-viewer/dist mtime
        dist = ROOT / "waifu-viewer" / "dist"
        if dist.exists():
            # if dist older than source, needs rebuild
            for wd in WATCH_DIRS:
                if not wd.exists(): continue
                for p in wd.rglob("*"):
                    if p.is_file() and p.stat().st_mtime > build_mtime:
                        # ignore .git, node_modules etc already not in WATCH_DIRS
                        return True
            # also if dist itself older than version.json? not needed
        else:
            # no dist yet -> needs build
            return True
        return False
    except:
        return False

@router.get("/api/version")
async def get_version():
    data = _read_version_json()
    data["needsRebuild"] = _needs_rebuild()
    data["serverTime"] = time.time()
    # also report dist existence
    dist = ROOT / "waifu-viewer" / "dist"
    data["hasDist"] = dist.exists()
    if dist.exists():
        try:
            data["distMtime"] = dist.stat().st_mtime
        except: pass
    return data

@router.get("/version.json")
async def get_version_json_alias():
    return await get_version()

@router.post("/api/version/rebuild")
async def trigger_rebuild():
    # trigger sync of version.json (bump buildTime) — actual vite build must be run externally
    # we just touch version.json to mark checked; client can poll again
    import subprocess, sys
    try:
        subprocess.Popen([sys.executable, "-c", "import pathlib; pathlib.Path('version.json').touch()"], cwd=str(ROOT))
    except: pass
    return {"ok": True, "version": _read_version(), "needsRebuild": _needs_rebuild()}
