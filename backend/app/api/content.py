"""Content packs — downloadable engine content (characters, models, backgrounds).

The engine ships slim; heavy packs are pulled on demand from the repo's
GitHub release assets and installed into the user content dir
(RIKO_CONTENT_DIR) or, for dev/self-host, the repo layout.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import json, os, threading, time, tempfile, shutil, zipfile, urllib.request

from app.paths import repo_root, pack_candidates, pack_target, dir_file_count, dir_size_mb

router = APIRouter(prefix="/api/content")

MANIFEST = repo_root() / "content" / "packs.json"

_tasks: dict = {}
_tasks_lock = threading.Lock()
_task_seq = 0

def _load_manifest():
    try:
        if MANIFEST.exists():
            j = json.loads(MANIFEST.read_text(encoding="utf-8"))
            packs = j.get("packs", [])
            if isinstance(packs, list):
                return packs
    except Exception:
        pass
    return []

def _app_version() -> str:
    for p in [repo_root() / "VERSION", repo_root() / "version.json"]:
        try:
            if p.exists():
                t = p.read_text().strip()
                if p.suffix == ".json":
                    t = json.loads(t).get("version", t)
                if t:
                    return t.split()[0]
        except Exception:
            pass
    return "EU-0.5.0-01"

def _packs_base_url() -> str:
    env = os.environ.get("RIKO_PACKS_URL")
    if env:
        return env.rstrip("/")
    return f"https://github.com/bcan77/riko-ai-waifu/releases/download/{_app_version()}"

def _pack_status(p: dict) -> dict:
    pid = p.get("id", "?")
    repo_dir = p.get("repo_dir", pid)
    cands = pack_candidates(pid, repo_dir)
    target = cands[0]
    marker = target / ".pack.json"
    installed_dir = next((d for d in cands if d.exists() and dir_file_count(d) > 0), None)
    version = None
    via_marker = False
    if marker.exists():
        try:
            version = json.loads(marker.read_text(encoding="utf-8")).get("version")
            via_marker = True
        except Exception:
            pass
    if version is None:
        version = p.get("version")
    return {
        "id": pid,
        "asset": p.get("asset"),
        "repo_dir": repo_dir,
        "size_mb": p.get("size_mb", 0),
        "url": f"{_packs_base_url()}/{p.get('asset')}",
        "installed": installed_dir is not None,
        "managed": via_marker,  # True if WE installed it (safe to remove)
        "path": str(installed_dir) if installed_dir else str(target),
        "files": dir_file_count(installed_dir) if installed_dir else 0,
        "installed_mb": dir_size_mb(installed_dir) if installed_dir else 0,
        "version": version,
    }

@router.get("/packs")
async def list_packs():
    return {"base": _packs_base_url(), "packs": [_pack_status(p) for p in _load_manifest()]}

@router.get("/tasks/{task_id}")
async def task_state(task_id: str):
    with _tasks_lock:
        t = _tasks.get(task_id)
        if not t:
            raise HTTPException(404, "unknown task")
        return dict(t)

class InstallReq(BaseModel):
    id: str

def _run_install(task_id: str, pack: dict):
    def set_state(**kw):
        with _tasks_lock:
            _tasks[task_id].update(kw)
    try:
        pid = pack["id"]
        repo_dir = pack.get("repo_dir", pid)
        url = f"{_packs_base_url()}/{pack.get('asset')}"
        target = pack_target(pid, repo_dir)
        set_state(state="downloading", progress=0.02, detail=url)
        target.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkdtemp(prefix="pack-"))
        zpath = tmp / pack.get("asset", f"{pid}.zip")
        # download (https release asset, or file:// for local testing)
        if url.startswith("file://"):
            src = Path(url[7:])
            if not src.exists():
                raise RuntimeError(f"local pack not found: {src}")
            total = src.stat().st_size
            with open(src, "rb") as fi, open(zpath, "wb") as fo:
                shutil.copyfileobj(fi, fo)
            set_state(progress=0.6)
        else:
            req = urllib.request.Request(url, headers={"User-Agent": "Compangine-Engine"})
            with urllib.request.urlopen(req, timeout=60) as r, open(zpath, "wb") as fo:
                total = int(r.headers.get("Content-Length", 0) or 0)
                got = 0
                while True:
                    chunk = r.read(1024 * 256)
                    if not chunk:
                        break
                    fo.write(chunk)
                    got += len(chunk)
                    if total:
                        set_state(state="downloading", progress=round(0.02 + 0.68 * got / total, 3))
        set_state(state="extracting", progress=0.75, detail=str(target))
        with zipfile.ZipFile(zpath, "r") as z:
            # traversal guard
            for n in z.namelist():
                if n.startswith("/") or ".." in n.split("/"):
                    raise RuntimeError(f"unsafe entry in pack: {n}")
            z.extractall(target)
        names = [n for n in os.listdir(target) if n != ".pack.json"]
        if not names:
            raise RuntimeError("pack extracted empty — download may be corrupt")
        (target / ".pack.json").write_text(json.dumps({
            "id": pid, "version": pack.get("version"),
            "asset": pack.get("asset"), "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }), encoding="utf-8")
        shutil.rmtree(tmp, ignore_errors=True)
        set_state(state="done", progress=1.0, detail=str(target))
    except Exception as e:
        set_state(state="error", error=str(e)[:500])

@router.post("/install")
async def install_pack(req: InstallReq):
    packs = {p.get("id"): p for p in _load_manifest()}
    pack = packs.get(req.id)
    if not pack:
        raise HTTPException(404, f"unknown pack: {req.id}")
    global _task_seq
    with _tasks_lock:
        _task_seq += 1
        task_id = f"pack-{req.id}-{_task_seq}"
        _tasks[task_id] = {"id": task_id, "pack": req.id, "state": "queued", "progress": 0.0, "detail": "", "error": ""}
    th = threading.Thread(target=_run_install, args=(task_id, pack), daemon=True)
    th.start()
    return {"ok": True, "task": task_id}

@router.delete("/packs/{pack_id}")
async def remove_pack(pack_id: str):
    packs = {p.get("id"): p for p in _load_manifest()}
    pack = packs.get(pack_id)
    if not pack:
        raise HTTPException(404, f"unknown pack: {pack_id}")
    repo_dir = pack.get("repo_dir", pack_id)
    target = pack_target(pack_id, repo_dir)
    marker = target / ".pack.json"
    # only remove packs WE installed (marker) — never nuke repo-tracked content
    if not marker.exists():
        raise HTTPException(409, "pack is repo-provided, not managed — delete files manually if you really want it gone")
    shutil.rmtree(target, ignore_errors=True)
    return {"ok": True, "removed": str(target)}
