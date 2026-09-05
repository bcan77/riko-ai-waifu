from fastapi import APIRouter
from app.services.memory.chroma import memory
from app.services.tools.registry import TOOLS, execute_tool
import psutil

router = APIRouter()

@router.get("/api/memory/search")
async def mem_search(q: str, n: int = 3):
    docs = await memory.search(q, n=n)
    return {"results": docs}

@router.post("/api/memory/store")
async def mem_store(payload: dict):
    text = payload.get("text","").strip()
    if not text: return {"ok": False}
    await memory.store(text, meta=payload.get("meta",{}))
    return {"ok": True}

@router.get("/api/system/stats")
async def system_stats():
    try:
        return await execute_tool("system_stats", {})
    except Exception as e:
        return {"error": str(e)}

@router.get("/api/tools/list")
async def tools_list():
    return {"tools": TOOLS}
