"""Neural Cloud REST: upload/list/preview/delete + (re)describe images."""
from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
import mimetypes
from app.services.neural_cloud import store
from app.services.neural_cloud.vision import describe_image

router = APIRouter(prefix="/api/cloud")

@router.get("/files")
async def cloud_list():
    return {"files": store.list_files()}

@router.post("/upload")
async def cloud_upload(file: UploadFile = File(...), describe: bool = Form(True)):
    data = await file.read()
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(413, "too large")
    try:
        meta = store.save_upload(file.filename or "upload.bin", data, file.content_type)
    except ValueError as e:
        raise HTTPException(400, str(e))
    vision = None
    if meta["kind"] == "image" and describe:
        res = await describe_image(data, meta["mime"])
        if res.get("ok"):
            meta = store.update_meta(meta["id"], {"description": res["text"]}) or meta
            vision = {"model": res.get("model")}
        else:
            vision = {"error": res.get("error")}
    out = {k: meta.get(k) for k in ("id", "name", "kind", "mime", "ext", "size", "created", "description", "text_chars")}
    out["vision"] = vision
    return {"ok": True, "file": out}

@router.get("/files/{fid}")
async def cloud_preview(fid: str):
    meta = store.get_meta(fid)
    if not meta:
        raise HTTPException(404, "not found")
    p = store.data_path(meta)
    if not p.exists():
        raise HTTPException(404, "data missing")
    media = meta.get("mime") or mimetypes.guess_type(str(p))[0] or "application/octet-stream"
    return FileResponse(str(p), media_type=media, headers={"Cache-Control": "no-store"})

@router.get("/files/{fid}/text")
async def cloud_text(fid: str, offset: int = 0, limit: int = 2000):
    """Paged extracted text / vision description — powers node previews."""
    meta = store.get_meta(fid)
    if not meta:
        raise HTTPException(404, "not found")
    return store.read_slice(meta, offset=max(0, offset), limit=min(12000, max(200, limit)))

class DescribeReq(BaseModel):
    prompt: str | None = None

@router.post("/files/{fid}/describe")
async def cloud_describe(fid: str, req: DescribeReq):
    meta = store.get_meta(fid)
    if not meta:
        raise HTTPException(404, "not found")
    if meta.get("kind") != "image":
        raise HTTPException(400, "only images can be described")
    p = store.data_path(meta)
    if not p.exists():
        raise HTTPException(404, "data missing")
    res = await describe_image(p.read_bytes(), meta.get("mime"), prompt=req.prompt)
    if not res.get("ok"):
        raise HTTPException(502, f"vision failed: {res.get('error')}")
    meta = store.update_meta(meta["id"], {"description": res["text"]}) or meta
    return {"ok": True, "model": res.get("model"), "description": res["text"]}

@router.delete("/files/{fid}")
async def cloud_delete(fid: str):
    if not store.delete_file(fid):
        raise HTTPException(404, "not found")
    return {"ok": True}
