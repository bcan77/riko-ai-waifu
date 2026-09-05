from .base import TTSProvider, TTSAudioChunk, Phoneme
from typing import AsyncIterator
import asyncio, math, struct, base64

# Kokoro onnx optional — we gracefully mock if not installed so backend still runs
try:
    from kokoro import KPipeline  # type: ignore
    HAS_KOKORO = True
except Exception:
    HAS_KOKORO = False

import numpy as np

class KokoroProvider(TTSProvider):
    """
    Local Kokoro TTS. If kokoro installed, streams sentence-wise.
    Otherwise mocks sine-wave phonemes so viseme pipeline can be tested without deps.
    Native phoneme timestamps when available; else synthetic timing.
    """
    def __init__(self):
        self._pipe = None
        if HAS_KOKORO:
            try:
                # lazy — actual pipeline created per lang on first synth
                pass
            except Exception:
                pass

    def _ensure_pipe(self, lang: str):
        if not HAS_KOKORO:
            return None
        if self._pipe is None:
            try:
                from kokoro import KPipeline
                self._pipe = {}
            except Exception:
                return None
        if lang not in self._pipe:
            try:
                from kokoro import KPipeline
                # lang here is kokoro code 'a' or 'j'; accept both forms
                code = lang if lang in ("a","j") else ("j" if lang in ("ja","jp") else "a")
                self._pipe[lang] = KPipeline(lang_code=code)
            except Exception:
                # fallback: try 'a' (american)
                try:
                    from kokoro import KPipeline
                    self._pipe[lang] = KPipeline(lang_code="a")
                except Exception:
                    return None
        return self._pipe[lang]

    async def synthesize_stream(self, text: str, voice_id: str | None = None, lang_hint: str | None = None) -> AsyncIterator[TTSAudioChunk]:
        from .voices import detect_lang
        lang = detect_lang(lang_hint, text)
        kokoro_lang = "j" if lang == "ja" else "a"
        voice = voice_id or ("jf_alpha" if lang == "ja" else "af_bella")
        # kokoro voice id without prefix
        voice_clean = voice.replace("kokoro-", "").strip()

        # split into sentences for streaming
        import re
        sentences = [s.strip() for s in re.split(r"(?<=[.!?。！？])\s+", text) if s.strip()]
        if not sentences:
            sentences = [text]

        t_cursor = 0.0

        if HAS_KOKORO:
            pipe = self._ensure_pipe(kokoro_lang)
            if pipe is not None:
                for sent in sentences:
                    try:
                        # KPipeline yields (graphemes, phonemes, audio)
                        result = pipe(sent, voice=voice_clean)
                        # kokoro onnx returns generator of (audio, ...). Handle both
                        for chunk in result:
                            # chunk may be tuple or object
                            audio = None
                            phonemes_raw = None
                            if isinstance(chunk, tuple):
                                # (audio_np, phonemes?) varies by version
                                audio = chunk[0] if len(chunk) > 0 else None
                                if len(chunk) > 1 and isinstance(chunk[1], list):
                                    phonemes_raw = chunk[1]
                            elif hasattr(chunk, "audio"):
                                audio = chunk.audio  # type: ignore
                                phonemes_raw = getattr(chunk, "phonemes", None)
                            else:
                                audio = chunk

                            if audio is None:
                                continue
                            # audio is numpy float32 [-1,1] at 24000
                            if hasattr(audio, "numpy"):
                                audio = audio.numpy()
                            audio_np = np.asarray(audio, dtype=np.float32)
                            pcm16 = (np.clip(audio_np, -1, 1) * 32767).astype(np.int16).tobytes()
                            dur = len(audio_np) / 24000.0
                            # build phonemes if available else synthetic
                            phonemes = self._parse_phonemes(phonemes_raw, t_cursor, dur, sent) if phonemes_raw else self._synthetic_phonemes(sent, t_cursor, dur)
                            yield TTSAudioChunk(audio=pcm16, sample_rate=24000, encoding="pcm16", phonemes=phonemes, t_start=t_cursor, t_end=t_cursor+dur)
                            t_cursor += dur
                            await asyncio.sleep(0)  # yield control
                    except Exception as e:
                        # on any kokoro error, fall through to mock for this sentence
                        pcm16, dur = self._mock_pcm(sent)
                        phonemes = self._synthetic_phonemes(sent, t_cursor, dur)
                        yield TTSAudioChunk(audio=pcm16, sample_rate=24000, encoding="pcm16", phonemes=phonemes, t_start=t_cursor, t_end=t_cursor+dur)
                        t_cursor += dur
                return

        # MOCK path — no kokoro installed
        for sent in sentences:
            pcm16, dur = self._mock_pcm(sent)
            phonemes = self._synthetic_phonemes(sent, t_cursor, dur)
            yield TTSAudioChunk(audio=pcm16, sample_rate=24000, encoding="pcm16", phonemes=phonemes, t_start=t_cursor, t_end=t_cursor+dur)
            t_cursor += dur
            await asyncio.sleep(0.02)  # simulate streaming

    def _parse_phonemes(self, raw, t_start: float, dur: float, text: str):
        # raw may be list of (phoneme, start, end) or string
        out: list[Phoneme] = []
        try:
            if isinstance(raw, str):
                # space separated
                parts = raw.split()
                if not parts:
                    return self._synthetic_phonemes(text, t_start, dur)
                per = dur / max(1, len(parts))
                for i, p in enumerate(parts):
                    out.append(Phoneme(phoneme=p.strip("ˈˌ"), start=t_start + i*per, end=t_start + (i+1)*per))
                return out
            for item in raw:
                if isinstance(item, (list, tuple)) and len(item) >= 1:
                    ph = str(item[0])
                    s = float(item[1]) if len(item) > 1 else 0
                    e = float(item[2]) if len(item) > 2 else s+0.07
                    out.append(Phoneme(phoneme=ph, start=t_start+s, end=t_start+e))
                elif isinstance(item, dict):
                    out.append(Phoneme(phoneme=str(item.get("phoneme","a")), start=t_start+float(item.get("start",0)), end=t_start+float(item.get("end",0.07))))
            if out:
                return out
        except Exception:
            pass
        return self._synthetic_phonemes(text, t_start, dur)

    def _synthetic_phonemes(self, text: str, t_start: float, dur: float) -> list[Phoneme]:
        # very simple: map characters to viseme-ish phonemes for demo
        # vowels get longer
        chars = [c for c in text.lower() if c.isalpha() or c in "あいうえおアイウエオ"]
        if not chars:
            chars = list(text.lower().replace(" ","")[: max(1, int(dur*10))])
        per = dur / max(1, len(chars))
        vowel_map = {"a":"a","i":"i","u":"u","e":"e","o":"o","あ":"a","い":"i","う":"u","え":"e","お":"o"}
        out: list[Phoneme] = []
        for i, ch in enumerate(chars):
            ph = vowel_map.get(ch, ch if ch in "aeiou" else "a" if i%5==0 else "i" if i%5==1 else "u")
            out.append(Phoneme(phoneme=ph, start=t_start + i*per, end=t_start + (i+1)*per))
        return out

    def _mock_pcm(self, text: str) -> tuple[bytes, float]:
        # offline fallback when kokoro not installed: return silence so viseme
        # still animates but no alien hum. Duration proportional but silent.
        dur = max(0.5, min(4.0, len(text) * 0.065 + 0.3))
        sr = 24000
        n = int(sr * dur)
        pcm = np.zeros(n, dtype=np.int16).tobytes()
        return pcm, dur
