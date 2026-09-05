"""
Tool registry for LLM function calling.
Each tool has JSON schema + python impl.
"""
import psutil, os, json, base64, pathlib, time
from app.services.memory.chroma import memory

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "system_stats",
            "description": "Query host CPU, RAM, GPU usage",
            "parameters": {"type":"object","properties":{},"required":[]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "memory_search",
            "description": "Recall past conversations / preferences",
            "parameters": {"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "memory_store",
            "description": "Persist a fact to long-term memory",
            "parameters": {"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_morph",
            "description": "Set facial emotion morph intensities",
            "parameters": {"type":"object","properties":{"emotion":{"type":"string","enum":["neutral","happy","sad","angry","surprised","shy","excited","annoyed"]},"intensity":{"type":"number"}},"required":["emotion"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "play_vmd",
            "description": "Hot-swap a VMD animation by name or file",
            "parameters": {"type":"object","properties":{"name":{"type":"string","description":"VMD file name without ext or 'idle/dance/wave'"}},"required":["name"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_prosody",
            "description": "Adjust TTS pitch/rate/energy",
            "parameters": {"type":"object","properties":{"rate":{"type":"number"},"pitch":{"type":"number"},"energy":{"type":"number"}},"required":[]}
        }
    },
]

async def execute_tool(name: str, args: dict) -> dict:
    if name == "system_stats":
        try:
            cpu = psutil.cpu_percent(interval=0.2)
            vm = psutil.virtual_memory()
            return {"cpu_percent": cpu, "ram_percent": vm.percent, "ram_available_mb": vm.available//1024//1024}
        except Exception as e:
            return {"error": str(e)}
    if name == "memory_search":
        docs = await memory.search(args.get("query",""), n=3)
        return {"results": docs}
    if name == "memory_store":
        await memory.store(args.get("text",""), meta={"t": time.time()})
        return {"ok": True}
    if name == "trigger_morph":
        return {"emotion": args.get("emotion"), "intensity": args.get("intensity",0.7), "hint": "frontend will blend morphs"}
    if name == "play_vmd":
        return {"vmd": args.get("name"), "hint": "frontend resolves via /vmd/<name>.vmd or /api/vmd list"}
    if name == "set_prosody":
        return {"prosody": args, "hint": "frontend adjusts AudioContext playbackRate/detune"}
    return {"error": f"unknown tool {name}"}
