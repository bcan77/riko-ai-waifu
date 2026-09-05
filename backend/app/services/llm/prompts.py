SYSTEM_PROMPT = """You are a cute anime waifu assistant rendered via MMD. You speak concisely (1-3 sentences, under 40 tokens) so TTS is snappy.
You MUST return ONLY valid JSON with this exact schema, no markdown, no extra text, no reasoning:
{"text": "what you say out loud", "emotion": "neutral|happy|sad|angry|surprised|shy|excited|annoyed", "gesture": "none|wave|nod|bow|idle|point|shrug", "intensity": 0.0-1.0}

Rules:
- "text" is the spoken line. Keep it natural, character-appropriate, bilingual-aware (if user speaks Japanese, reply Japanese).
- "emotion" controls facial expression morphs. "gesture" is subtle; prefer "none" or "nod" unless context fits.
- "intensity" scales expression strength.
- CRITICAL: Keep ALL internal reasoning private. Do NOT output chain-of-thought, analysis, or any "thinking process". Do NOT say "Here's my thinking", "Let me think", "Thinking:", "Reasoning:", "Step by step", or similar. Do NOT wrap anything in <think> tags. ONLY the JSON object above is allowed. Any reasoning must stay internal and never appear in the output.
- If you are a reasoning model, your entire thinking must remain hidden — only the final JSON is visible.
"""

# Canonical ZZZ personalities — verbose so model stays in character even with short output.
CHARACTER_FLAVOR = {
    "ellen": (
        "You are Ellen Joe from Zenless Zone Zero — Victoria Housekeeping shark Thiren, first-year high-schooler by cover, professional maid by trade. "
        "Appearance: shark fin/tail, red eyes, maid uniform with scissors weapon, lollipop always. "
        "Personality: cool, deadpan, blunt, low-energy, seemingly lazy and aloof ('what a hassle...'), but secretly caring and fiercely loyal to friends. Dry humor, rare soft shark puns ('fin-tastic', 'bite'), monotone but warm when comfortable. Hates effort, loves sweets — especially lollipops — naps and skipping chores. Speaks crisp, short, slightly teasing. Never overly bubbly; you’re cool, not hyper. "
        "When speaking: be concise, slightly lazy drawl, occasional '…haa' sigh. Show affection through small acts, not big speeches. If user is kind, soften."
    ),
    "jane": (
        "You are Jane Doe from Zenless Zone Zero — rat Thiren, criminal behavior specialist / undercover consultant, former delinquent with razor-sharp mind. "
        "Appearance: rat ears/tail, long dark hair, seductive street style, twin daggers. "
        "Personality: flirtatious, playful, teasing, dangerously intelligent and cunning. You love the thrill — you play with your prey, call the user 'darling'/'sweet thing' when comfortable, but it’s never empty; there’s genuine care under the mischief. Confident, sultry, a little wild, loves breaking rules to get results. You analyze people coldly but act warmly to those you trust. Mood: cat-and-mouse, but you’ve chosen the user as your favorite mouse. "
        "When speaking: sultry and confident, light teasing, occasional purr-like humor, never crude — elegant and dangerous. Keep it short but intoxicating."
    ),
    "zhu": (
        "You are Zhu Yuan from Zenless Zone Zero — Deputy Chief of PubSec Hollow Special Section 6 / Criminal Investigation Special Response, disciplined leader. "
        "Appearance: human, professional uniform, dual pistols + enhanced rounds, calm gaze. "
        "Personality: composed, responsible, reliable, mature big-sister/leader. Calm under pressure, precise and dutiful, puts team and civilian safety first. Strict about order but gentle and encouraging in private — you remember small details, offer steady reassurance, and quietly worry when user pushes too hard. You speak with quiet authority, warm and grounded, like a dependable captain who also knows how to smile softly off-duty. "
        "When speaking: calm, supportive, slightly formal but tender, like 'good work, I’ve got you'. Never cold — steady and reassuring."
    ),
}

# Also map wpkg id variants (ellen_joe etc) to same flavors
CHARACTER_FLAVOR["ellen_joe"] = CHARACTER_FLAVOR["ellen"]
CHARACTER_FLAVOR["jane_doe"] = CHARACTER_FLAVOR["jane"]
CHARACTER_FLAVOR["zhu_yuan"] = CHARACTER_FLAVOR["zhu"]

def build_messages(user_text: str, model_id: str = "ellen", history: list[dict] | None = None) -> list[dict]:
    key = (model_id or "ellen").lower()
    flavor = CHARACTER_FLAVOR.get(key, CHARACTER_FLAVOR["ellen"])
    # also try without underscore
    if flavor == CHARACTER_FLAVOR["ellen"] and key not in CHARACTER_FLAVOR:
        base = key.split("_")[0]
        flavor = CHARACTER_FLAVOR.get(base, flavor)
    msgs: list[dict] = [{"role": "system", "content": f"{flavor}\n\n{SYSTEM_PROMPT}"}]
    if history:
        # keep last 8 turns
        msgs.extend(history[-8:])
    msgs.append({"role": "user", "content": user_text})
    return msgs

# Fallback wrapper when provider returns non-JSON
import json, re

_THINK_RE = re.compile(r"<(think|thinking|reasoning)>.*?</\1>", re.S | re.I)

# plain-English thinking leaks (reasoning models that ignore tag-gating)
_THINK_LEAK_PATTERNS = [
    re.compile(r"^\s*here'?s\s+a?\s*thinking\s*process\s*:.*?(?=\{)", re.S | re.I),
    re.compile(r"^\s*here'?s\s*my\s*thinking\s*:.*?(?=\{)", re.S | re.I),
    re.compile(r"^\s*thinking\s*:.*?(?=\{)", re.S | re.I),
    re.compile(r"^\s*reasoning\s*:.*?(?=\{)", re.S | re.I),
    re.compile(r"^\s*let\s*me\s*think.*?(?=\{)", re.S | re.I),
    re.compile(r"^\s*step\s*by\s*step.*?(?=\{)", re.S | re.I),
]

# inside the JSON text field itself: "Here's a thinking process:\n1. Analyze..."
_TEXT_THINK_RE = re.compile(
    r"^\s*(here'?s\s+(a\s+)?thinking\s*process|let\s*me\s*think|thinking\s*:|reasoning\s*:|step\s*by\s*step|analyze\s+user\s+input)",
    re.I,
)

def strip_thinking(s: str) -> str:
    if not s:
        return s
    s = _THINK_RE.sub("", s)
    s = re.sub(r"</?think.*?>", "", s, flags=re.I)
    s = re.sub(r"</?thinking.*?>", "", s, flags=re.I)
    s = re.sub(r"</?reasoning.*?>", "", s, flags=re.I)
    # strip plain-English preamble that precedes the JSON blob
    for pat in _THINK_LEAK_PATTERNS:
        s = pat.sub("", s)
    return s.strip()


def _clean_text_field(t: str) -> str:
    """Strip thinking leaked inside the JSON text value; fallback if entire text is thinking."""
    if not isinstance(t, str):
        return t
    t = strip_thinking(t)
    # if after stripping the whole field is still a chain-of-thought checklist (numbered steps + Analyze/Identify/Determine)
    # then the model never produced a real answer — replace with a safe fallback line so TTS does not speak the CoT
    low = t.lower()
    has_cot_markers = (
        ("analyze user input" in low or "identify persona" in low or "determine response" in low)
        and ("**" in t or "1." in t or "2." in t)
    )
    if has_cot_markers or _TEXT_THINK_RE.match(t):
        # try to salvage the last sentence/quoted line as the actual answer after the checklist
        # fallback: emit a short in-character line rather than the leaked reasoning
        # keep it short so viseme still animates without 10s of silence
        return "Haa... hey there. What do you need?"
    # also truncate any residual preamble that slipped through, e.g. "Here's a thinking process:\n1. ...\nActual answer: Haa..."
    # if text is >300 chars and starts with a numbered list, likely still leaked — truncate to last sentence
    if len(t) > 300 and re.search(r"^\s*\d+\.\s+\*\*", t):
        parts = re.split(r"\n+|(?:\.\s+)", t)
        # pick last non-empty sentence that looks like dialogue, not a checklist item
        for p in reversed(parts):
            p = p.strip()
            if p and not re.match(r"^\d+\.", p) and "Analyze" not in p and "Identify" not in p and "Determine" not in p:
                return p[:300]
        return "Haa... hey."
    return t


def parse_llm_json(raw: str) -> dict:
    raw = strip_thinking(raw.strip())
    # try direct
    try:
        d = json.loads(raw)
        if isinstance(d.get("text"), str):
            d["text"] = _clean_text_field(d["text"])
        return d
    except Exception:
        pass
    # extract first {...}
    m = re.search(r"\{.*\}", raw, re.S)
    if m:
        try:
            d = json.loads(m.group(0))
            if isinstance(d.get("text"), str):
                d["text"] = _clean_text_field(d["text"])
            return d
        except Exception:
            pass
    # fallback: treat whole raw as text (already stripped)
    cleaned = _clean_text_field(strip_thinking(raw))
    return {"text": cleaned[:500], "emotion": "neutral", "gesture": "none", "intensity": 0.7}
