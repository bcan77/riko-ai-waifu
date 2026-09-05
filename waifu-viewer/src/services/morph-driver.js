/**
 * morph-driver — drives MMD morphTargetInfluences from viseme frames.
 * Also handles idle breathing + blinking + emotion bias.
 */
export function createMorphDriver(getMesh) {
  let talking = false
  let emotion = 'neutral'
  let blinkTimer = 0
  let blinkPhase = 0 // 0 idle, 1 closing, 2 opening

  // emotion -> morph bias (multiplies a/i/u/e/o slightly, drives eye/eyebrow morphs if present)
  const EMOTION_BIAS = {
    neutral: {},
    happy: { '笑い': 0.35, 'にっこり': 0.25 },
    sad: { '困る': 0.3, 'なごみ': 0.15 },
    angry: { '怒り': 0.4 },
    surprised: { '驚き': 0.35, 'はちゅ目': 0.2 },
    shy: { '照れ': 0.35, 'にっこり': 0.2 },
    excited: { '笑い': 0.5, 'はちゅ目': 0.15 },
    annoyed: { '怒り': 0.25, '困る': 0.2 },
  }

  function applyMorphs(morphs) {
    const mesh = getMesh()
    if (!mesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return
    const dict = mesh.morphTargetDictionary
    // zero viseme morphs first (but keep emotion bias)
    const visemes = ['a', 'i', 'u', 'e', 'o', 'あ', 'い', 'う', 'え', 'お']
    // we lerp rather than hard set for smoothness — caller lerps; here we set directly
    for (const k of visemes) {
      const idx = dict[k]
      if (idx !== undefined) mesh.morphTargetInfluences[idx] = morphs?.[k] ?? 0
    }
    // alias sync: ensureascii and jp match
    const aliasPairs = [['a','あ'],['i','い'],['u','う'],['e','え'],['o','お']]
    for (const [en, jp] of aliasPairs) {
      const enIdx = dict[en], jpIdx = dict[jp]
      if (enIdx !== undefined && jpIdx !== undefined) {
        const v = mesh.morphTargetInfluences[enIdx]
        mesh.morphTargetInfluences[jpIdx] = v
      }
    }
    // emotion bias (additive, clamped)
    const bias = EMOTION_BIAS[emotion] || {}
    for (const [name, w] of Object.entries(bias)) {
      const idx = dict[name]
      if (idx !== undefined) mesh.morphTargetInfluences[idx] = Math.min(1, Math.max(0, (mesh.morphTargetInfluences[idx] || 0) + w * 0.6))
    }
  }

  function tick(dt, ctxTime, visemeMorphs) {
    const mesh = getMesh()
    if (!mesh) return

    // blinking — simple timer, ~4s interval, 150ms close
    blinkTimer += dt
    if (blinkPhase === 0 && blinkTimer > 3.5 + Math.random() * 2.5) {
      blinkPhase = 1
      blinkTimer = 0
    }
    let blink = 0
    if (blinkPhase === 1) {
      blink = Math.min(1, blinkTimer / 0.07)
      if (blinkTimer > 0.07) { blinkPhase = 2; blinkTimer = 0 }
    } else if (blinkPhase === 2) {
      blink = 1 - Math.min(1, blinkTimer / 0.09)
      if (blinkTimer > 0.09) { blinkPhase = 0; blinkTimer = 0 }
    }

    if (talking && visemeMorphs) {
      // talking — drive from viseme + blink
      const m = { ...visemeMorphs }
      // blink morph name varies: まばたき or ウィンク etc — try common
      m['まばたき'] = Math.max(m['まばたき'] || 0, blink)
      applyMorphs(m)
      // subtle chest breathing scaled up while talking
      if (mesh.skeleton) {
        const t = ctxTime * 1.2
        const scale = 1 + Math.sin(t * 1.8) * 0.006
        // don't touch skeleton for now — breathing via morph is enough
      }
    } else {
      // idle — soft breathing on mouth (tiny) + blink; keep last viseme decayed
      const idleMouth = Math.sin(ctxTime * 0.9) * 0.04 + 0.02
      const m = { a: idleMouth, i: idleMouth * 0.5, u: 0, e: 0, o: 0, 'まばたき': blink }
      // add emotion lingering briefly
      const bias = EMOTION_BIAS[emotion] || {}
      for (const [k, v] of Object.entries(bias)) m[k] = v * 0.35
      applyMorphs(m)
    }
  }

  return {
    setTalking(v, emo) { talking = v; if (emo) emotion = emo },
    tick,
    get talking() { return talking },
  }
}
