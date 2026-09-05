from .mapper import phoneme_to_viseme, viseme_weights, VISEME_SET, JP_ALIAS
from app.services.tts.base import Phoneme
from typing import List, Dict
import math

def phonemes_to_frames(
    phonemes: List[Phoneme],
    fps: int = 60,
    intensity: float = 0.85,
    lookahead: float = 0.05,
) -> List[Dict]:
    """
    Convert timed phonemes to per-frame morph weights at fps.
    Emits frames covering [min_start - lookahead, max_end] with coarticulation smoothing.
    Each frame: {"t": float, "morphs": {"a":..,"i":..,"u":..,"e":..,"o":.., "あ":..}, "duration": 1/fps}
    """
    if not phonemes:
        return []

    t0 = min(p.start for p in phonemes) - lookahead
    t1 = max(p.end for p in phonemes)
    if t1 <= t0:
        t1 = t0 + 0.5
    dt = 1.0 / fps
    n = max(1, math.ceil((t1 - t0) / dt))

    # Build per-phoneme viseme targets
    # For smoothing, we interpolate between current and next viseme near boundaries
    frames: List[Dict] = []
    # Precompute viseme per phoneme
    visemes = [phoneme_to_viseme(p.phoneme) for p in phonemes]

    for i in range(n):
        t = t0 + i * dt
        # find active phoneme (or nearest)
        active_idx = None
        for idx, p in enumerate(phonemes):
            if p.start <= t < p.end:
                active_idx = idx
                break
        if active_idx is None:
            # before first or after last — hold nearest with decay
            if t < phonemes[0].start:
                active_idx = 0
                # ramp up
                alpha = max(0.0, min(1.0, (t - t0) / 0.05))
                w = viseme_weights(visemes[active_idx], intensity * alpha)
            else:
                active_idx = len(phonemes) - 1
                # decay
                decay = math.exp(-(t - phonemes[-1].end) * 8)
                w = viseme_weights(visemes[active_idx], intensity * decay)
                if decay < 0.02:
                    w = {k: 0.0 for k in w}
            frames.append({"t": round(t, 4), "morphs": {k: round(v, 3) for k, v in w.items()}, "duration": round(dt, 4)})
            continue

        # active phoneme — check if near boundary to blend with next
        p = phonemes[active_idx]
        v = visemes[active_idx]
        w_cur = viseme_weights(v, intensity)

        # crossfade 30ms before end
        blend_window = 0.03
        if active_idx + 1 < len(phonemes) and (p.end - t) < blend_window:
            v_next = visemes[active_idx + 1]
            w_next = viseme_weights(v_next, intensity)
            a = (blend_window - (p.end - t)) / blend_window  # 0->1
            # ease
            a = a * a * (3 - 2 * a)
            w = {k: round((1 - a) * w_cur.get(k, 0) + a * w_next.get(k, 0), 3) for k in w_cur}
        else:
            # attack smoothing at start 15ms
            attack = 0.015
            if (t - p.start) < attack:
                a = (t - p.start) / attack
                w = {k: round(v * max(0, a), 3) for k, v in w_cur.items()}
            else:
                w = {k: round(v, 3) for k, v in w_cur.items()}

        frames.append({"t": round(t, 4), "morphs": w, "duration": round(dt, 4)})

    return frames

def viseme_frames_for_text_len(text: str, duration: float, t_start: float = 0.0) -> List[Dict]:
    """Fallback when no phonemes — estimate from text length."""
    # synthesize dummy phonemes evenly
    clean = [c for c in text if c.strip()]
    if not clean:
        return []
    n_chars = len(clean)
    per = duration / n_chars
    dummy = []
    # vowel cycle for variety
    cycle = ["a", "i", "u", "e", "o"]
    for i, ch in enumerate(clean):
        ph = cycle[i % len(cycle)] if ch.lower() not in "aeiou" else ch.lower()
        dummy.append(Phoneme(phoneme=ph, start=t_start + i * per, end=t_start + (i + 1) * per))
    return phonemes_to_frames(dummy)
