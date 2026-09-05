import asyncio, json, base64, re, time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.manager import manager
from app.services.llm.prompts import build_messages, parse_llm_json, strip_thinking, _clean_text_field
from app.services.llm.factory import stream_with_fallback
from app.services.tts.factory import get_tts_for_request
from app.services.tts.kokoro import HAS_KOKORO, KokoroProvider
from app.services.tts.voices import resolve_voice, is_japanese
from app.services.viseme.scheduler import phonemes_to_frames
from app.models.schemas import LLMStructuredOutput

router = APIRouter()

SENTENCE_RE = re.compile(r"(?<=[.!?。！？])\s+")

async def pipeline(ws: WebSocket, client_id: str, user_text: str, model_id: str, voice_override: str | None, premium: bool, llm_model: str | None = None):
    """
    Streams: llm_start -> llm_token* -> llm_end -> tts_start -> (viseme + audio)* -> animation -> done
    Supports barge-in via task cancellation (manager.cancel_task).
    """
    try:
        await manager.send_json(client_id, {"type": "llm_start"})
        messages = build_messages(user_text, model_id=model_id)
        buf = ""
        full_json_raw = ""
        # guard reasoning leaks: tag-based + plain-English preamble
        _think_re_open = re.compile(r"<(think|thinking|reasoning)[^>]*>", re.I)
        _think_re_close = re.compile(r"</(think|thinking|reasoning)>", re.I)
        _plain_think_re = re.compile(r"here'?s\s+a?\s*thinking\s*process", re.I)
        inside_think = False
        plain_leak = False
        async for tok in stream_with_fallback(messages, model_override=llm_model):
            full_json_raw += tok
            low_all = full_json_raw.lower()
            # detect plain-English leak once; then suppress tokens until we see JSON object start
            if not plain_leak and _plain_think_re.search(low_all):
                # if raw already contains a JSON object, the leak is preamble — suppress until first '{'
                if "{" not in low_all[:low_all.find("here")] if "here" in low_all else False:
                    plain_leak = True
                elif "{" in full_json_raw and full_json_raw.index("{") > full_json_raw.lower().find("here"):
                    plain_leak = True
            _opens = len(_think_re_open.findall(full_json_raw))
            _closes = len(_think_re_close.findall(full_json_raw))
            inside_think = _opens > _closes
            if inside_think:
                continue
            _low = tok.lower()
            if "<think" in _low or "</think" in _low:
                continue
            if plain_leak and "{" not in full_json_raw:
                # still in preamble before JSON object — suppress
                continue
            # once we've seen the JSON object start, stop suppressing plain leak
            if plain_leak and "{" in full_json_raw:
                plain_leak = False
            await manager.send_json(client_id, {"type": "llm_token", "token": tok})
            # optional early sentence dispatch could be added here; for now wait for full JSON for emotion/gesture
            await asyncio.sleep(0)

        parsed = parse_llm_json(full_json_raw or buf or "{}")
        # validate via pydantic
        try:
            llm_out = LLMStructuredOutput.model_validate(parsed)
        except Exception:
            llm_out = LLMStructuredOutput(text=strip_thinking(str(parsed.get("text", full_json_raw))[:500]), emotion="neutral", gesture="none", intensity=0.7)
        # final guard — never speak raw thinking (also catches plain-English leaks)
        try:
            llm_out.text = _clean_text_field(llm_out.text)
        except Exception:
            try:
                llm_out.text = strip_thinking(llm_out.text)
            except Exception:
                pass

        await manager.send_json(client_id, {"type": "llm_end", "full_text": llm_out.text, "emotion": llm_out.emotion, "gesture": llm_out.gesture, "intensity": llm_out.intensity})

        # TTS — ensure voice matches final lang (re-resolve if japanese detected)
        voice_id, lang = resolve_voice(model_id, voice_override=voice_override, lang_hint=llm_out.text)
        if is_japanese(llm_out.text):
            lang = "ja"
            if not voice_override:
                # re-resolve to pick ja voice (avoid en voice with ja pipeline)
                voice_id, _ = resolve_voice(model_id, voice_override=None, lang_hint="ja")
        else:
            lang = "en"
            # keep voice_id as resolved for en (already correct)
        tts = get_tts_for_request(premium=premium, voice_id=voice_id)
        is_mock = isinstance(tts, KokoroProvider) and not HAS_KOKORO
        await manager.send_json(client_id, {"type": "tts_start", "sample_rate": 24000, "encoding": "pcm16", "voice": voice_id, "lang": lang, "mock": is_mock})
        await manager.send_json(client_id, {"type": "animation", "state": "talking", "emotion": llm_out.emotion, "gesture": llm_out.gesture, "intensity": llm_out.intensity})

        # Stream TTS chunks
        chunk_index = 0
        async for chunk in tts.synthesize_stream(llm_out.text, voice_id=voice_id, lang_hint=lang):
            # phonemes -> viseme frames
            frames = []
            if chunk.phonemes:
                frames = phonemes_to_frames(chunk.phonemes, fps=60, intensity=llm_out.intensity)
            # emit viseme slightly before audio (lookahead already in scheduler)
            if frames:
                await manager.send_json(client_id, {"type": "viseme", "frames": frames, "t_start": chunk.t_start, "t_end": chunk.t_end, "chunk_index": chunk_index})
            # audio as base64
            b64 = base64.b64encode(chunk.audio).decode("ascii")
            await manager.send_json(client_id, {
                "type": "audio",
                "chunk_index": chunk_index,
                "data": b64,
                "t_start": chunk.t_start,
                "t_end": chunk.t_end,
                "sample_rate": chunk.sample_rate,
                "encoding": chunk.encoding,
            })
            chunk_index += 1
            await asyncio.sleep(0)

        await manager.send_json(client_id, {"type": "done"})

    except asyncio.CancelledError:
        # barge-in
        try:
            await manager.send_json(client_id, {"type": "interrupted"})
        except Exception:
            pass
        raise
    except Exception as e:
        try:
            await manager.send_json(client_id, {"type": "error", "code": "pipeline_failed", "message": str(e)})
        except Exception:
            pass

@router.websocket("/ws/talk")
async def ws_talk(ws: WebSocket):
    client_id = f"{id(ws)}"
    await manager.connect(ws, client_id)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                await manager.send_json(client_id, {"type": "error", "code": "bad_json", "message": "invalid JSON"})
                continue

            mtype = msg.get("type")

            if mtype == "ping":
                await manager.send_json(client_id, {"type": "pong", "t": time.time()})
            elif mtype == "stop":
                manager.cancel_task(client_id)
                await manager.send_json(client_id, {"type": "interrupted"})
            elif mtype == "chat":
                text = (msg.get("text") or "").strip()
                if not text:
                    continue
                model_id = msg.get("model_id") or msg.get("modelId") or "ellen"
                voice_id = msg.get("voice_id") or msg.get("voiceId")
                premium = bool(msg.get("premium", False))
                llm_model = msg.get("llm_model") or msg.get("openrouter_model") or None
                if isinstance(llm_model, str): llm_model = llm_model.strip() or None
                # cancel previous pipeline if any
                manager.cancel_task(client_id)
                # give a tick for cancellation
                await asyncio.sleep(0.02)
                task = asyncio.create_task(pipeline(ws, client_id, text, model_id, voice_id, premium, llm_model))
                manager.set_task(client_id, task)
                # don't await — allow stop/ping interleaving; but handle completion
                # attach done callback to avoid unhandled exception warnings
                def _done(t: asyncio.Task):
                    if t.cancelled():
                        return
                    exc = t.exception()
                    if exc:
                        # already sent error in pipeline
                        pass
                task.add_done_callback(_done)
            elif mtype == "stt_chunk":
                # reserved for future server-side STT; currently client uses Web Speech API
                # we could forward to whisper if needed, but ignore for now
                pass
            else:
                await manager.send_json(client_id, {"type": "error", "code": "unknown_type", "message": f"unknown type {mtype}"})

    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception:
        manager.disconnect(client_id)
