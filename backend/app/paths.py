"""Central path resolution — dev repo layout vs packaged engine + user content.

Layout contract:
- RIKO_ROOT: repo root in dev (default, derived from this file), or the
  packaged resources dir when the desktop app sets it.
- RIKO_CONTENT_DIR: writable dir for downloadable content packs
  (default: <userData>/content on desktop, repo root in dev/self-host).
- Each pack has a flat id dir under the content dir (characters/…) and a
  legacy repo_dir (e.g. waifu-viewer/public/models). Serving probes the
  content dir first, then the repo layout, so clones keep working with
  zero downloads while installs stay user-scoped on desktop.
"""
import os
from pathlib import Path

def repo_root() -> Path:
    env = os.environ.get("RIKO_ROOT")
    if env:
        return Path(env)
    # backend/app/paths.py -> backend -> root
    return Path(__file__).resolve().parent.parent.parent

def content_base() -> Path:
    env = os.environ.get("RIKO_CONTENT_DIR")
    if env:
        return Path(env)
    return repo_root()

def pack_candidates(pack_id: str, repo_dir: str) -> list:
    """Ordered probe dirs for a pack: user content first, repo layout second."""
    out = []
    base = content_base()
    flat = base / pack_id
    if flat != (repo_root() / repo_dir):
        out.append(flat)
    out.append(repo_root() / repo_dir)
    # de-dup while keeping order
    seen = []
    for p in out:
        if p not in seen:
            seen.append(p)
    return seen

def pack_target(pack_id: str, repo_dir: str) -> Path:
    """Where a fresh download is installed."""
    return pack_candidates(pack_id, repo_dir)[0]

def first_existing(dirs) -> Path | None:
    for d in dirs:
        try:
            if d.exists():
                return d
        except Exception:
            pass
    return None

def dir_file_count(d: Path) -> int:
    try:
        if not d.exists():
            return 0
        n = 0
        for _ in d.rglob("*"):
            n += 1
            if n > 50000:
                break
        return n
    except Exception:
        return 0

def dir_size_mb(d: Path) -> float:
    try:
        if not d.exists():
            return 0.0
        total = 0
        for p in d.rglob("*"):
            try:
                if p.is_file():
                    total += p.stat().st_size
            except Exception:
                pass
        return round(total / 1024 / 1024, 1)
    except Exception:
        return 0.0
