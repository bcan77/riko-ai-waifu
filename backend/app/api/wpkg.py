from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os, json, shutil, tempfile, pathlib
from app.config import settings

router = APIRouter(prefix="/api/wpkg")
WPKG_DIR = pathlib.Path(__file__).resolve().parents[3] / "characters"

def _list_wpkg():
    WPKG_DIR.mkdir(exist_ok=True)
    out=[]
    for p in WPKG_DIR.glob("*.wpkg"):
        st=p.stat()
        entry={"file":p.name,"size":st.st_size,"mtime":st.st_mtime,"rating":"all","name":p.stem}
        # peek manifest for rating/name (cheap — manifest.json is tiny)
        try:
            import zipfile
            with zipfile.ZipFile(p,'r') as z:
                if "manifest.json" in z.namelist():
                    man=json.load(z.open("manifest.json"))
                    if man.get("rating") in ("all","12","18"): entry["rating"]=man["rating"]
                    if isinstance(man.get("name"), str) and man["name"]: entry["name"]=man["name"]
        except Exception:
            pass
        out.append(entry)
    return sorted(out, key=lambda x:x["file"])

@router.get("/list")
async def wpkg_list():
    return _list_wpkg()

@router.get("/info")
async def wpkg_info(file: str):
    # unpack to tmp and read manifest
    target = (WPKG_DIR / file).resolve()
    if not str(target).startswith(str(WPKG_DIR.resolve())): raise HTTPException(400,"bad file")
    if not target.exists(): raise HTTPException(404,"not found")
    import zipfile
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(target,'r') as z:
            z.extractall(tmp)
        man_path = os.path.join(tmp,'manifest.json')
        if not os.path.exists(man_path): return {"error":"manifest missing"}
        man=json.load(open(man_path))
        # also load system prompt if present
        sys_prompt=""
        if man.get("prompts",{}).get("system_file"):
            sf=os.path.join(tmp, man["prompts"]["system_file"])
            if os.path.exists(sf): sys_prompt=open(sf,encoding='utf-8',errors='ignore').read()[:2000]
            else:
                # try prompts/system.md fallback
                alt=os.path.join(tmp,'prompts','system.md')
                if os.path.exists(alt): sys_prompt=open(alt,encoding='utf-8',errors='ignore').read()[:2000]
        man["prompts"]={**man.get("prompts",{}),"system":sys_prompt}
        # content metadata defaults for packages created before ratings existed
        if man.get("rating") not in ("all","12","18"): man["rating"]="all"
        if not isinstance(man.get("tags"), list): man["tags"]=[]
        if not isinstance(man.get("content_flags"), list): man["content_flags"]=[]
        if not isinstance(man.get("description"), str): man["description"]=""
        # expose outfits info: include resolved count
        if "outfits" not in man and man.get("model",{}).get("entry"):
            man["outfits"] = [{"id":"default","name":"Default","entry":man["model"]["entry"]}]
        return man

@router.post("/validate")
async def wpkg_validate(payload: dict):
    from packages_wpkg_stub import validate_stub
    # inline validate to avoid node dep
    errs=[]
    if payload.get("spec")!=1: errs.append("spec must be 1")
    if not payload.get("id"): errs.append("id required")
    if not payload.get("name"): errs.append("name required")
    # content metadata — ratings + tags
    if payload.get("rating") is not None and payload.get("rating") not in ("all","12","18"):
        errs.append("rating must be one of: all, 12, 18")
    tags = payload.get("tags")
    if tags is not None:
        if not isinstance(tags, list): errs.append("tags must be array")
        elif len(tags) > 24: errs.append("tags max 24")
    flags = payload.get("content_flags")
    if flags is not None:
        if not isinstance(flags, list): errs.append("content_flags must be array")
        elif len(flags) > 12: errs.append("content_flags max 12")
    desc = payload.get("description")
    if desc is not None and (not isinstance(desc, str) or len(desc) > 2000):
        errs.append("description max 2000 chars")
    # outfits validation
    outfits = payload.get("outfits")
    if outfits is not None:
        if not isinstance(outfits, list): errs.append("outfits must be array")
        else:
            seen=set()
            for i,o in enumerate(outfits):
                if not isinstance(o, dict): errs.append(f"outfits[{i}] must be object"); continue
                if not o.get("id") or not o["id"].replace("_","").replace("-","").isalnum(): errs.append(f"outfits[{i}].id required")
                elif o["id"] in seen: errs.append(f"outfits[{i}].id duplicate")
                else: seen.add(o["id"])
                if not o.get("name"): errs.append(f"outfits[{i}].name required")
                if not o.get("entry"): errs.append(f"outfits[{i}].entry required")
                elif ".." in o["entry"] or o["entry"].startswith("/"): errs.append(f"outfits[{i}].entry traversal")
            if outfits and payload.get("model",{}).get("entry"):
                pass
            if payload.get("outfit_default") and payload["outfit_default"] not in seen:
                errs.append("outfit_default must match an outfit id")
    return {"ok": len(errs)==0, "errors":errs}

@router.post("/upload")
async def wpkg_upload(file: UploadFile = File(...)):
    WPKG_DIR.mkdir(exist_ok=True)
    if not file.filename.endswith(".wpkg"): raise HTTPException(400,"must be .wpkg")
    dest = WPKG_DIR / file.filename
    # guard traversal
    dest = dest.resolve()
    if not str(dest).startswith(str(WPKG_DIR.resolve())): raise HTTPException(400,"bad name")
    if file.size and file.size > 200*1024*1024: raise HTTPException(413,"too large")
    data = await file.read()
    if len(data) > 200*1024*1024: raise HTTPException(413,"too large")
    # basic zip check
    import zipfile, io
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names=z.namelist()
            if "manifest.json" not in names: raise HTTPException(400,"manifest.json missing in wpkg")
    except zipfile.BadZipFile:
        raise HTTPException(400,"invalid zip/wpgk")
    dest.write_bytes(data)
    return {"ok": True, "file": dest.name, "bytes": len(data)}

@router.post("/create")
async def wpkg_create(payload: dict):
    # create or update wpkg — if exists, unpack and preserve model/motions
    import zipfile, io
    pid = payload.get("id","my_waifu")
    if not pid.replace("_","").replace("-","").isalnum(): raise HTTPException(400,"bad id")
    WPKG_DIR.mkdir(exist_ok=True)
    out_path = WPKG_DIR / f"{pid}.wpkg"
    existing_tmp = None
    try:
        # build tmp dir
        with tempfile.TemporaryDirectory() as tmp:
            # if updating existing, unpack it first to preserve files
            if out_path.exists():
                try:
                    with zipfile.ZipFile(out_path,'r') as z:
                        z.extractall(tmp)
                except Exception:
                    pass
            else:
                os.makedirs(os.path.join(tmp,"prompts"), exist_ok=True)
                os.makedirs(os.path.join(tmp,"model"), exist_ok=True)
                os.makedirs(os.path.join(tmp,"motions"), exist_ok=True)
                if not os.path.exists(os.path.join(tmp,"preview.png")):
                    open(os.path.join(tmp,"preview.png"),"wb").write(b"")
            # ensure dirs
            os.makedirs(os.path.join(tmp,"prompts"), exist_ok=True)
            os.makedirs(os.path.join(tmp,"model"), exist_ok=True)
            os.makedirs(os.path.join(tmp,"motions"), exist_ok=True)
            # manifest — merge with existing if present
            man_path = os.path.join(tmp,"manifest.json")
            existing_man = {}
            if os.path.exists(man_path):
                try: existing_man = json.load(open(man_path,encoding='utf-8'))
                except: existing_man = {}
            man={
                "spec":1,
                "id":pid,
                "name":payload.get("name",existing_man.get("name",pid)),
                "version":payload.get("version",existing_man.get("version","1.0.0")),
                "author":payload.get("author",existing_man.get("author","you")),
                "model": existing_man.get("model", {"entry":"model/model.pmx"}),
                "voice":payload.get("voice", existing_man.get("voice", {"provider":"kokoro","en":"af_sky","ja":"jf_alpha"})),
                "prompts":{"system_file":"prompts/system.md"},
                "motions":{"idle": payload.get("motions",{}).get("idle", existing_man.get("motions",{}).get("idle")), "gestures": existing_man.get("motions",{}).get("gestures",{})},
                "affinity": payload.get("affinity", existing_man.get("affinity",0.5)),
                "rating": payload.get("rating", existing_man.get("rating","all")),
                "tags": payload.get("tags", existing_man.get("tags",[])),
                "content_flags": payload.get("content_flags", existing_man.get("content_flags",[])),
                "description": payload.get("description", existing_man.get("description","")),
                "created_at": payload.get("created_at", existing_man.get("created_at","2026-09-03"))
            }
            # outfits support
            if "outfits" in payload and payload["outfits"] is not None:
                man["outfits"] = payload["outfits"]
                if payload.get("outfit_default"):
                    man["outfit_default"] = payload["outfit_default"]
            elif "outfits" in existing_man:
                man["outfits"] = existing_man["outfits"]
                if "outfit_default" in existing_man:
                    man["outfit_default"] = existing_man["outfit_default"]
            else:
                # ensure at least one outfit entry for backwards compat
                man["outfits"] = [{"id":"default","name":"Default","entry": man["model"]["entry"]}]
                man["outfit_default"] = "default"
            # allow model entry override if provided
            if payload.get("model",{}).get("entry"):
                man["model"]["entry"] = payload["model"]["entry"]
            # also allow outfit_default override
            if payload.get("outfit_default"):
                man["outfit_default"] = payload["outfit_default"]
            open(man_path,"w").write(json.dumps(man,indent=2))
            # system prompt file
            sys_text = payload.get("prompts",{}).get("system")
            if sys_text is not None:
                open(os.path.join(tmp,"prompts","system.md"),"w",encoding="utf-8").write(sys_text)
            elif not os.path.exists(os.path.join(tmp,"prompts","system.md")):
                open(os.path.join(tmp,"prompts","system.md"),"w",encoding="utf-8").write(f"You are {man['name']}.")
            # zip STORE
            buf=io.BytesIO()
            with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_STORED) as z:
                for root,dirs,files in os.walk(tmp):
                    for fn in files:
                        full=os.path.join(root,fn)
                        rel=os.path.relpath(full,tmp)
                        z.write(full, rel)
            out_path.write_bytes(buf.getvalue())
        return {"ok": True, "file": out_path.name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
