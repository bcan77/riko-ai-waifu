"""
Maps phonemes (ARPAbet, IPA, kana) to MMD morphs a,i,u,e,o.
MMD models use either ascii 'a','i','u','e','o' or Japanese 'あ','い','う','え','お' — we emit both
and client resolves via morphTargetDictionary lookup.
"""
from typing import Dict

# canonical 5-vowel visemes
VISEME_SET = ("a", "i", "u", "e", "o")
JP_ALIAS = {"a": "あ", "i": "い", "u": "う", "e": "え", "o": "お"}

# ARPAbet -> viseme (CMU dict)
ARPABET_MAP: Dict[str, str] = {
    # a
    "AA": "a", "AE": "a", "AH": "a", "AO": "o", "AW": "a",
    # i
    "IH": "i", "IY": "i", "Y": "i", "YU": "u",
    # u
    "UH": "u", "UW": "u", "W": "u",
    # e
    "EH": "e", "EY": "e", "AY": "a",
    # o
    "OW": "o", "OY": "o", "ER": "e",
    # consonants -> nearest mouth shape (neutral-ish, slight influence)
    "B": "u", "P": "u", "M": "u",  # bilabial → u (closed)
    "F": "i", "V": "i",
    "TH": "i", "DH": "i",
    "S": "i", "Z": "i",
    "SH": "i", "ZH": "i",
    "L": "e", "R": "e", "N": "e", "NG": "e",
    "K": "a", "G": "a", "HH": "a",
    "CH": "i", "JH": "i",
    "D": "a", "T": "a",
}

# IPA / simplified
IPA_MAP: Dict[str, str] = {
    "a": "a", "ɑ": "a", "æ": "a", "ɐ": "a",
    "i": "i", "ɪ": "i", "y": "u", "ɨ": "i",
    "u": "u", "ʊ": "u", "ɯ": "u",
    "e": "e", "ɛ": "e", "ɜ": "e", "ɚ": "e",
    "o": "o", "ɔ": "o", "ʌ": "a", "ɒ": "o",
    "w": "u", "j": "i",
}

# Kana mora -> viseme (vowel of the mora)
KANA_MAP: Dict[str, str] = {
    "あ": "a", "か": "a", "さ": "a", "た": "a", "な": "a", "は": "a", "ま": "a", "や": "a", "ら": "a", "わ": "a", "が": "a", "ざ": "a", "だ": "a", "ば": "a", "ぱ": "a",
    "い": "i", "き": "i", "し": "i", "ち": "i", "に": "i", "ひ": "i", "み": "i", "り": "i", "ぎ": "i", "じ": "i", "び": "i", "ぴ": "i",
    "う": "u", "く": "u", "す": "u", "つ": "u", "ぬ": "u", "ふ": "u", "む": "u", "ゆ": "u", "る": "u", "ぐ": "u", "ず": "u", "ぶ": "u", "ぷ": "u",
    "え": "e", "け": "e", "せ": "e", "て": "e", "ね": "e", "へ": "e", "め": "e", "れ": "e", "げ": "e", "ぜ": "e", "で": "e", "べ": "e", "ぺ": "e",
    "お": "o", "こ": "o", "そ": "o", "と": "o", "の": "o", "ほ": "o", "も": "o", "よ": "o", "ろ": "o", "を": "o", "ご": "o", "ぞ": "o", "ど": "o", "ぼ": "o", "ぽ": "o",
    "ん": "u",  # n
}

def phoneme_to_viseme(ph: str) -> str:
    ph = ph.strip().lower()
    if not ph:
        return "a"
    # direct kana
    if ph in KANA_MAP:
        return KANA_MAP[ph]
    # ARPAbet with stress digits e.g., AH0
    base = ph.rstrip("012").upper()
    if base in ARPABET_MAP:
        return ARPABET_MAP[base]
    # also try upper raw
    if ph.upper() in ARPABET_MAP:
        return ARPABET_MAP[ph.upper()]
    # IPA
    if ph in IPA_MAP:
        return IPA_MAP[ph]
    if ph and ph[0] in IPA_MAP:
        return IPA_MAP[ph[0]]
    # single latin vowel
    if ph in ("a", "i", "u", "e", "o"):
        return ph
    # consonant fallback: map by first letter
    if ph[0] in ("b", "p", "m"):
        return "u"
    if ph[0] in ("f", "v", "s", "z"):
        return "i"
    return "a"

def viseme_weights(viseme: str, intensity: float = 1.0) -> Dict[str, float]:
    """One-hot + jp alias, rest 0, intensity 0-1."""
    w = {v: 0.0 for v in VISEME_SET}
    if viseme in w:
        w[viseme] = max(0.0, min(1.0, intensity))
    # add jp aliases for client convenience
    for k, jp in JP_ALIAS.items():
        w[jp] = w[k]
    return w
