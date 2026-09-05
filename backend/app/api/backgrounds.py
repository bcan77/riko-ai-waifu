from fastapi import APIRouter
from pathlib import Path

router = APIRouter()

ROOT = Path(__file__).resolve().parent.parent.parent.parent  # project root
BG_SRC = ROOT / "backgrounds"
PUBLIC_BG = ROOT / "waifu-viewer" / "public" / "backgrounds"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".hdr", ".exr"}
MODEL_EXTS = {".fbx", ".glb", ".gltf", ".obj", ".pmx", ".pmd"}

def list_backgrounds():
    out = []
    seen = set()

    # Map top-level folder -> model file rel (first found)
    model_map = {}  # id -> { file: rel, ext: str }
    model_tops = set()  # top folders that contain a model

    for base in [BG_SRC, PUBLIC_BG]:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            ext = p.suffix.lower()
            if ext not in MODEL_EXTS:
                continue
            rel = p.relative_to(base).as_posix()
            # id: if file is inside a folder, use top folder name; if at root, use file rel
            if "/" in rel:
                top = rel.split("/")[0]
                bid = top
                # remember that this top folder has a model
                model_tops.add(top)
                if bid not in model_map:
                    model_map[bid] = {"file": rel, "ext": ext}
            else:
                bid = rel
                if bid not in model_map:
                    model_map[bid] = {"file": rel, "ext": ext}

    # Add model entries first
    for bid, info in model_map.items():
        if bid in seen:
            continue
        seen.add(bid)
        name = bid.replace("_", " ").replace("-", " ").strip()
        # prettify: Title case but keep original if has caps
        # keep as is for folder names like Cozy-Living-Room
        out.append({
            "id": bid,
            "name": name,
            "file": f"/backgrounds/{info['file']}",
            "type": "model",
            "ext": info["ext"],
            "modelFile": info["file"],
        })

    # Image entries — skip any image inside a model top folder
    for base in [BG_SRC, PUBLIC_BG]:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            ext = p.suffix.lower()
            if ext not in IMAGE_EXTS:
                continue
            rel = p.relative_to(base).as_posix()
            if rel in seen:
                continue
            # skip images inside a model folder (textures)
            top = rel.split("/")[0] if "/" in rel else ""
            if top in model_tops:
                continue
            # also skip if parent folder is literally "textures" under a model folder — already covered
            seen.add(rel)
            name = Path(rel).stem
            folder = str(Path(rel).parent)
            label = f"{folder}/{name}" if folder and folder != "." else name
            out.append({
                "id": rel,
                "name": label,
                "file": f"/backgrounds/{rel}",
                "type": "image",
                "size": p.stat().st_size if p.exists() else 0,
            })

    out.sort(key=lambda x: (0 if x.get("type") == "model" else 1, x["name"].lower()))
    return out

@router.get("/api/backgrounds")
async def get_backgrounds():
    return list_backgrounds()

@router.get("/api/backgrounds/list")
async def get_backgrounds_alias():
    return list_backgrounds()
