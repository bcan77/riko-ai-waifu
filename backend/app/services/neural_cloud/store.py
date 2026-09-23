"""Neural Cloud file store: save/list/get/delete + text extraction + search."""
import os, re, json, time, uuid, mimetypes
from pathlib import Path
from app.paths import content_base

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
TEXT_EXTS = {".txt", ".md", ".markdown", ".csv", ".json", ".log"}
PDF_EXTS = {".pdf"}
ALLOWED_EXTS = IMAGE_EXTS | TEXT_EXTS | PDF_EXTS

def cloud_dir() -> Path:
    d = content_base() / "neural_cloud"
    d.mkdir(parents=True, exist_ok=True)
    return d

def _safe_id() -> str:
    return uuid.uuid4().hex[:12]

def _meta_path(fid: str) -> Path:
    return cloud_dir() / f"{fid}.json"

def _data_name(fid: str, ext: str) -> str:
    return f"{fid}{ext}"

def save_upload(filename: str, data: bytes, mime: str | None = None) -> dict:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise ValueError(f"unsupported file type {ext or '(none)'} — allowed: {sorted(ALLOWED_EXTS)}")
    max_bytes = int(os.environ.get("RIKO_CLOUD_MAX_MB", "0") or 0)
    try:
        from app.config import settings
        max_bytes = settings.cloud_max_mb * 1024 * 1024
    except Exception:
        max_bytes = 25 * 1024 * 1024
    if len(data) > max_bytes:
        raise ValueError(f"file too large ({len(data)//1024//1024}MB > {max_bytes//1024//1024}MB)")
    fid = _safe_id()
    kind = "image" if ext in IMAGE_EXTS else ("pdf" if ext in PDF_EXTS else "text")
    d = cloud_dir()
    (d / _data_name(fid, ext)).write_bytes(data)
    meta = {
        "id": fid, "name": Path(filename).name, "kind": kind,
        "mime": mime or mimetypes.guess_type(filename)[0] or "application/octet-stream",
        "ext": ext, "size": len(data), "created": time.time(),
        "description": "",  # filled by vision for images
        "text_chars": 0,
    }
    if kind in ("text", "pdf"):
        try:
            txt = extract_text(meta)
            meta["text_chars"] = len(txt or "")
        except Exception:
            pass
    _meta_path(fid).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta

def list_files() -> list:
    d = cloud_dir()
    out = []
    for p in sorted(d.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            m = json.loads(p.read_text(encoding="utf-8"))
            # hide sidecar text files from listing (only real uploads)
            out.append({k: m.get(k) for k in ("id", "name", "kind", "mime", "ext", "size", "created", "description", "text_chars")})
        except Exception:
            continue
    return out

def get_meta(fid: str) -> dict | None:
    p = _meta_path(fid)
    if not p.exists():
        # also allow lookup by original filename
        for m in list_files():
            if m["name"] == fid or m["id"] == fid:
                return full_meta(m["id"])
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def full_meta(fid: str) -> dict | None:
    return get_meta(fid)

def update_meta(fid: str, patch: dict) -> dict | None:
    m = get_meta(fid)
    if not m:
        return None
    m.update(patch)
    _meta_path(m["id"]).write_text(json.dumps(m, indent=2), encoding="utf-8")
    return m

def data_path(meta: dict) -> Path:
    return cloud_dir() / _data_name(meta["id"], meta.get("ext", ""))

def delete_file(fid: str) -> bool:
    m = get_meta(fid)
    if not m:
        return False
    fid = m["id"]
    for suffix in (m.get("ext", ""), ".txt"):
        try:
            (cloud_dir() / f"{fid}{suffix}").unlink()
        except Exception:
            pass
    try:
        _meta_path(fid).unlink()
    except Exception:
        pass
    return True

def extract_text(meta: dict, max_chars: int = 50000) -> str:
    """Best-effort text for text/pdf files. Images use their vision description."""
    kind = meta.get("kind")
    if kind == "image":
        return meta.get("description", "")
    p = data_path(meta)
    if not p.exists():
        return ""
    if kind == "pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            return "[PDF text unavailable — install pypdf on the backend for PDF text extraction]"
        try:
            reader = PdfReader(str(p))
            txt = "\n".join([(pg.extract_text() or "") for pg in reader.pages])
            return txt[:max_chars]
        except Exception as e:
            return f"[PDF read failed: {e}]"
    try:
        raw = p.read_bytes()
        for enc in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                return raw.decode(enc)[:max_chars]
            except Exception:
                continue
        return raw.decode("utf-8", errors="ignore")[:max_chars]
    except Exception as e:
        return f"[read failed: {e}]"

def resolve_ref(ref: str) -> dict | None:
    """Find a file by id or (case-insensitive) original filename."""
    ref = (ref or "").strip()
    if not ref:
        return None
    m = get_meta(ref)
    if m:
        return m
    low = ref.lower()
    for cand in list_files():
        if cand["name"].lower() == low:
            return full_meta(cand["id"])
    # prefix match on id
    for cand in list_files():
        if cand["id"].startswith(low):
            return full_meta(cand["id"])
    return None

def read_slice(meta: dict, offset: int = 0, limit: int = 4000) -> dict:
    full = extract_text(meta)
    total = len(full)
    offset = max(0, offset)
    chunk = full[offset:offset + limit]
    return {
        "id": meta["id"], "name": meta["name"],
        "offset": offset, "limit": limit, "total_chars": total,
        "truncated": offset + limit < total,
        "text": chunk,
    }

def search_all(query: str, max_hits: int = 5, ctx: int = 160) -> list:
    q = (query or "").strip().lower()
    if not q:
        return []
    terms = [t for t in re.split(r"\s+", q) if t]
    hits = []
    for m in list_files():
        txt = extract_text(m) or ""
        low = txt.lower()
        score = sum(low.count(t) for t in terms)
        if score <= 0:
            # also match filename
            if q in m["name"].lower():
                score = 1
            else:
                continue
        idx = low.find(terms[0]) if terms[0] in low else 0
        start = max(0, idx - ctx)
        snippet = txt[start:start + ctx * 2 + len(q)]
        if start > 0:
            snippet = "…" + snippet
        if start + len(snippet) < len(txt):
            snippet = snippet + "…"
        hits.append({"id": m["id"], "name": m["name"], "kind": m["kind"], "score": score, "snippet": snippet[:600]})
    hits.sort(key=lambda h: -h["score"])
    return hits[:max_hits]

def index_for_prompt() -> str:
    """Compact file INDEX for the system prompt — names only, never contents."""
    files = list_files()
    if not files:
        return ""
    lines = []
    for m in files:
        extra = ""
        if m["kind"] == "image" and not m.get("description"):
            extra = " (not described yet)"
        lines.append(f"- {m['name']} [id:{m['id']}] ({m['kind']}, {m['size']//1024}KB){extra}")
    return "Neural Cloud files (use cloud tools to read — contents are NOT in this prompt):\n" + "\n".join(lines)
