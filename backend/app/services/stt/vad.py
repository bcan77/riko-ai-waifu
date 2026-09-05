"""
Silero VAD lite — energy-based fallback if onnx not installed.
Used for barge-in detection.
"""
import math, struct

class VAD:
    def __init__(self, threshold: float = 0.45, sample_rate: int = 16000):
        self.threshold = threshold
        self.sr = sample_rate
        self._has_onnx = False
        try:
            import onnxruntime  # type: ignore
            self._has_onnx = False  # we don't ship model by default; energy fallback is sufficient
        except Exception:
            pass

    def is_speech(self, pcm_bytes: bytes) -> bool:
        # pcm16 mono 16k
        if not pcm_bytes or len(pcm_bytes) < 320:
            return False
        # energy gate
        n = len(pcm_bytes)//2
        import struct
        fmt = f"<{n}h"
        try:
            samples = struct.unpack(fmt, pcm_bytes[:n*2])
        except Exception:
            return False
        # rms
        s = sum((x/32768)**2 for x in samples) / max(1, n)
        rms = math.sqrt(s)
        # threshold tuned for mic
        return rms > self.threshold * 0.08  # scaled
