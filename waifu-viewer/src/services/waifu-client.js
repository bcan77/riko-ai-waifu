/**
 * waifu-client.js — WebSocket bridge: LLM + TTS + viseme -> MMD morphs + AudioContext
 * Exposes: connect(), sendChat(text), stop(), onStatus(cb)
 * Morph mapping covers both ascii and kana morph names.
 */
const WS_URL = (() => {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  // vite proxy handles /ws in dev; in prod use same host:8000 or relative
  if (location.port === '5173') return `${proto}//${location.hostname}:8000/ws/talk`
  return `${proto}//${location.hostname}:8000/ws/talk`
})()

function b64ToBytes(b64) {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}

function pcm16ToAudioBuffer(ctx, pcmBytes, sampleRate = 24000) {
  const pcm16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2)
  const buf = ctx.createBuffer(1, pcm16.length, sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < pcm16.length; i++) ch[i] = pcm16[i] / 32768
  return buf
}

export class WaifuClient {
  constructor(opts = {}) {
    this.onStatus = opts.onStatus || (() => {})
    this.onChatMessage = opts.onChatMessage || (() => {})
    this.getModelId = opts.getModelId || (() => 'ellen')
    this.getLlmModel = opts.getLlmModel || (() => null)
    this.getMorphController = opts.getMorphController || (() => null)
    this.ws = null
    this.connected = false
    this.reconnectTimer = null
    this.audioCtx = null
    this.nextAudioTime = 0
    this.visemeTimeline = [] // [{tAbs, morphs, duration}]
    this.talkStartCtxTime = 0
    this.scheduledSources = []
    this.currentEmotion = 'neutral'
    this.premium = false
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    this.ws = new WebSocket(WS_URL)
    this.ws.onopen = () => {
      this.connected = true
      this.onStatus('WS connected', '')
      this._startPinger()
    }
    this.ws.onclose = () => {
      this.connected = false
      this.onStatus('WS disconnected — retrying…', 'warn')
      this._stopPinger()
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = setTimeout(() => this.connect(), 1800)
    }
    this.ws.onerror = () => {
      this.onStatus('WS error', 'err')
    }
    this.ws.onmessage = (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      this._handleMessage(msg)
    }
  }

  _pinger = null
  _startPinger() {
    this._stopPinger()
    this._pinger = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping' }))
    }, 20000)
  }
  _stopPinger() { if (this._pinger) clearInterval(this._pinger); this._pinger = null }

  _ensureAudio() {
    if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume()
    return this.audioCtx
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'llm_start':
        this.onChatMessage({ role: 'assistant', partial: '', emotion: 'neutral' })
        break
      case 'llm_token': {
        this.onChatMessage({ role: 'assistant', token: msg.token })
        break
      }
      case 'llm_end':
        this.onChatMessage({ role: 'assistant', full_text: msg.full_text, emotion: msg.emotion, gesture: msg.gesture, intensity: msg.intensity })
        this.currentEmotion = msg.emotion
        break
      case 'tts_start': {
        const ctx = this._ensureAudio()
        this.talkStartCtxTime = ctx.currentTime + 0.08 // small lookahead
        this.nextAudioTime = this.talkStartCtxTime
        this.visemeTimeline = []
        this._clearScheduledAudio(false)
        if(msg.mock){
          this.onStatus(`TTS offline — speaking muted (${msg.voice||''} • ${msg.lang||''}) — install kokoro-onnx or enable premium`, 'warn')
        } else {
          this.onStatus(`Speaking • ${msg.voice || ''} • ${msg.lang || ''}`, '')
        }
        // set idle->talking visual flag via morph controller
        const ctrl = this.getMorphController()
        if (ctrl?.setTalking) ctrl.setTalking(true, msg.emotion || this.currentEmotion)
        break
      }
      case 'viseme': {
        // frames are relative t; convert to absolute ctx time using t_start offset
        const base = this.talkStartCtxTime + (msg.t_start || 0)
        for (const f of (msg.frames || [])) {
          this.visemeTimeline.push({ tAbs: base + (f.t - (msg.frames[0]?.t || 0)), morphs: f.morphs, duration: f.duration })
        }
        // keep sorted
        this.visemeTimeline.sort((a, b) => a.tAbs - b.tAbs)
        break
      }
      case 'audio': {
        const ctx = this._ensureAudio()
        const bytes = b64ToBytes(msg.data)
        const buf = pcm16ToAudioBuffer(ctx, bytes, msg.sample_rate || 24000)
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.connect(ctx.destination)
        // prosody: playbackRate scales pitch+duration
        try { src.playbackRate.value = this.prosodyRate || 1; if (this.prosodyPitch) src.detune.value = this.prosodyPitch*100; } catch {}
        const when = Math.max(ctx.currentTime + 0.02, this.nextAudioTime)
        src.start(when)
        this.scheduledSources.push(src)
        this.nextAudioTime = when + buf.duration
        src.onended = () => {
          // if this was last source, mark idle shortly after
          if (ctx.currentTime >= this.nextAudioTime - 0.05) {
            const ctrl = this.getMorphController()
            if (ctrl?.setTalking) ctrl.setTalking(false, 'neutral')
          }
        }
        break
      }
      case 'animation':
        // emotion/gesture cue — used for face only (no body VMD swap in v1)
        this.currentEmotion = msg.emotion || this.currentEmotion
        break
      case 'done':
        this.onStatus('Ready', '')
        break
      case 'interrupted':
        this._clearScheduledAudio(true)
        this.visemeTimeline = []
        {
          const ctrl = this.getMorphController()
          if (ctrl?.setTalking) ctrl.setTalking(false, 'neutral')
        }
        this.onStatus('Interrupted', 'warn')
        break
      case 'error':
        this.onStatus(`Error: ${msg.message || msg.code}`, 'err')
        break
      case 'pong': break
      default: break
    }
  }

  _clearScheduledAudio(hard) {
    for (const s of this.scheduledSources) { try { s.stop() } catch {} try { s.disconnect() } catch {} }
    this.scheduledSources = []
    if (hard && this.audioCtx) {
      // also reset timeline so morphs zero quickly
      this.nextAudioTime = this.audioCtx.currentTime
    }
  }

  sendChat(text) {
    if (!text?.trim()) return
    this._ensureAudio()
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
      this.connect()
      // queue after short delay
      setTimeout(() => this._sendChatNow(text), 400)
      return
    }
    this._sendChatNow(text)
  }

  _sendChatNow(text) {
    const modelId = this.getModelId()
    const llmModel = this.getLlmModel()
    const payload = { type: 'chat', text, model_id: modelId, premium: this.premium }
    if(llmModel) payload.llm_model = llmModel
    this.ws.send(JSON.stringify(payload))
    this.onChatMessage({ role: 'user', text })
  }

  stop() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'stop' }))
    this._clearScheduledAudio(true)
    this.visemeTimeline = []
    const ctrl = this.getMorphController()
    if (ctrl?.setTalking) ctrl.setTalking(false, 'neutral')
  }

  /** Called every frame from main.js animate(); ctxTime is audioCtx.currentTime */
  // prosody knobs set via tools
  prosodyRate = 1
  prosodyPitch = 0
  prosodyEnergy = 1
  sampleViseme(ctxTime) {
    if (!this.visemeTimeline.length) return null
    // find frame where tAbs <= ctxTime < tAbs+duration
    // if between frames, lerp between nearest two
    let idx = -1
    for (let i = 0; i < this.visemeTimeline.length; i++) {
      const f = this.visemeTimeline[i]
      if (ctxTime >= f.tAbs && ctxTime < f.tAbs + f.duration + 0.016) { idx = i; break }
      if (ctxTime < f.tAbs) { idx = i; break }
    }
    if (idx === -1) {
      // past end
      if (ctxTime > this.visemeTimeline[this.visemeTimeline.length - 1].tAbs + 0.3) return null
      idx = this.visemeTimeline.length - 1
    }
    const cur = this.visemeTimeline[idx]
    // if we have next, lerp 30% for smoothness (coarticulation already done server-side but extra smooth here)
    const nxt = this.visemeTimeline[idx + 1]
    if (nxt && Math.abs(nxt.tAbs - cur.tAbs) < 0.05) {
      const a = Math.min(1, Math.max(0, (ctxTime - cur.tAbs) / (nxt.tAbs - cur.tAbs || 0.016)))
      const blended = {}
      const keys = new Set([...Object.keys(cur.morphs), ...Object.keys(nxt.morphs)])
      for (const k of keys) blended[k] = (1 - a) * (cur.morphs[k] || 0) + a * (nxt.morphs[k] || 0)
      return blended
    }
    return cur.morphs
  }
}
