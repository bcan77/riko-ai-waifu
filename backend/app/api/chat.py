from fastapi import APIRouter
from app.models.schemas import ChatRequest
from app.services.llm.prompts import build_messages
from app.services.llm.factory import complete_with_fallback

router = APIRouter()

@router.post("/api/chat")
async def chat(req: ChatRequest):
    messages = build_messages(req.text, model_id=req.model_id)
    model_override = (req.llm_model or req.openrouter_model or None)
    if isinstance(model_override, str): model_override = model_override.strip() or None
    out = await complete_with_fallback(messages, model_override=model_override)
    return out
