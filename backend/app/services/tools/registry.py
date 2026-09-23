"""
Tool registry for LLM function calling.
Each tool has JSON schema + python impl.
Split: BACKEND_TOOLS run here; FRONTEND_TOOLS are forwarded to the
client over WS {type:"tool"} and applied there (morphs, VMD, prosody).
"""
import psutil, os, json, base64, pathlib, time, math, ast, operator
from datetime import datetime
from zoneinfo import ZoneInfo
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
    # ── everyday tools (backend) ──
    {
        "type": "function",
        "function": {
            "name": "get_time",
            "description": "Current local time. Optional IANA timezone like 'Europe/Istanbul' or 'Asia/Tokyo'.",
            "parameters": {"type":"object","properties":{"timezone":{"type":"string","description":"IANA timezone, default server local"}},"required":[]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_date",
            "description": "Current date: year/month/day, weekday, ISO week. Optional IANA timezone.",
            "parameters": {"type":"object","properties":{"timezone":{"type":"string","description":"IANA timezone, default server local"}},"required":[]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Evaluate a math expression. Supports + - * / % **, parentheses, pi/e, sqrt/sin/cos/tan/log/floor/ceil/abs/round/min/max. No variables, no imports.",
            "parameters": {"type":"object","properties":{"expression":{"type":"string","description":"e.g. '(250*1.2 + 30)/4'"}},"required":["expression"]}
        }
    },
    # ── Neural Cloud file tools (backend; contents served on demand, never in prompt) ──
    {
        "type": "function",
        "function": {
            "name": "cloud_list_files",
            "description": "List Neural Cloud files (name, kind, size). Call first to discover what the user uploaded.",
            "parameters": {"type":"object","properties":{},"required":[]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cloud_read_file",
            "description": "Read a file's text (documents) or vision description (images). Prefer this over guessing. Paged: use offset for long files.",
            "parameters": {"type":"object","properties":{
                "ref": {"type":"string","description":"file id or exact filename"},
                "offset": {"type":"number","description":"char offset, default 0"},
                "limit": {"type":"number","description":"max chars, default 4000, max 12000"}
            },"required":["ref"]}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cloud_search",
            "description": "Keyword search across all Neural Cloud file texts/descriptions. Returns snippets.",
            "parameters": {"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}
        }
    },
]

# tools executed client-side (forwarded over WS, never run here)
FRONTEND_TOOLS = {"trigger_morph", "play_vmd", "set_prosody"}
# tools the model may call during the chat pipeline
CHAT_TOOLS = [
    t for t in TOOLS
    if t["function"]["name"] not in ("system_stats", "memory_store")
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
    if name == "get_time":
        dt = _now_in_tz((args or {}).get("timezone"))
        if dt is None:
            return {"error": f"unknown timezone '{(args or {}).get('timezone')}' — use IANA names like Europe/Istanbul"}
        return {"time": dt.strftime("%H:%M:%S"), "timezone": str(dt.tzinfo), "iso": dt.isoformat()}
    if name == "get_date":
        dt = _now_in_tz((args or {}).get("timezone"))
        if dt is None:
            return {"error": f"unknown timezone '{(args or {}).get('timezone')}' — use IANA names like Europe/Istanbul"}
        return {"date": dt.strftime("%Y-%m-%d"), "weekday": dt.strftime("%A"),
                "day": dt.day, "month": dt.month, "year": dt.year,
                "iso_week": dt.isocalendar().week, "timezone": str(dt.tzinfo)}
    if name == "calculator":
        return _calc((args or {}).get("expression", ""))
    if name == "cloud_list_files":
        from app.services.neural_cloud import store as cloud_store
        return {"files": [
            {"id": m["id"], "name": m["name"], "kind": m["kind"], "size_kb": m["size"] // 1024}
            for m in cloud_store.list_files()
        ]}
    if name == "cloud_read_file":
        from app.services.neural_cloud import store as cloud_store
        a = args or {}
        meta = cloud_store.resolve_ref(a.get("ref", ""))
        if not meta:
            return {"error": f"file not found: '{a.get('ref')}' — call cloud_list_files for exact names"}
        try:
            off = int(a.get("offset", 0) or 0)
        except Exception:
            off = 0
        try:
            lim = min(12000, max(200, int(a.get("limit", 4000) or 4000)))
        except Exception:
            lim = 4000
        return cloud_store.read_slice(meta, offset=off, limit=lim)
    if name == "cloud_search":
        from app.services.neural_cloud import store as cloud_store
        return {"hits": cloud_store.search_all((args or {}).get("query", ""))}
    return {"error": f"unknown tool {name}"}


def _now_in_tz(tz: str | None):
    try:
        if tz:
            return datetime.now(ZoneInfo(str(tz).strip()))
        return datetime.now().astimezone()
    except Exception:
        return None


_CALC_BINOPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.Mod: operator.mod, ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}
_CALC_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_CALC_FUNCS = {
    "sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
    "log": math.log, "log10": math.log10, "exp": math.exp,
    "floor": math.floor, "ceil": math.ceil, "abs": abs, "round": round,
    "min": min, "max": max, "sum": sum, "pi": math.pi, "e": math.e,
}

def _calc(expr: str) -> dict:
    expr = (expr or "").strip()
    if not expr:
        return {"error": "empty expression"}
    if len(expr) > 200:
        return {"error": "expression too long (max 200 chars)"}
    try:
        tree = ast.parse(expr, mode="eval")
    except Exception:
        return {"error": f"cannot parse '{expr}'"}
    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise ValueError("numbers only")
        if isinstance(node, ast.BinOp) and type(node.op) in _CALC_BINOPS:
            return _CALC_BINOPS[type(node.op)](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _CALC_UNARY:
            return _CALC_UNARY[type(node.op)](_eval(node.operand))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _CALC_FUNCS:
            fn = _CALC_FUNCS[node.func.id]
            if node.keywords:
                raise ValueError("no keyword args")
            return fn(*[_eval(a) for a in node.args])
        if isinstance(node, ast.Name) and node.id in ("pi", "e"):
            return _CALC_FUNCS[node.id]
        if isinstance(node, ast.List):
            return [_eval(e) for e in node.elts]
        raise ValueError(f"not allowed: {type(node).__name__}")
    try:
        val = _eval(tree)
        if isinstance(val, float) and (math.isinf(val) or math.isnan(val)):
            return {"error": "result is not a finite number (division by zero?)"}
        return {"result": val}
    except ZeroDivisionError:
        return {"error": "division by zero"}
    except Exception as e:
        return {"error": f"cannot evaluate: {e}"}
