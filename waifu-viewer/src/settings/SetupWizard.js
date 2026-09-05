/**
 * SetupWizard — first-boot onboarding. Covers API keys + character + quick prefs.
 * Shows when store.onboarded === false. Persists onboarded flag on finish/skip.
 */
import { get, set, setOnboarded } from './store.js'

const WIZ_FREE_MODELS = [
  { id:'google/gemini-2.0-flash-001', label:'Gemini 2.0 Flash (default · not free)' },
  { id:'poolside/laguna-xs-2.1:free', label:'Laguna XS 2.1 — free · 33B code · 262k' },
  { id:'poolside/laguna-s-2.1:free', label:'Laguna S 2.1 — free · 118B code · 262k' },
  { id:'thinkingmachines/inkling:free', label:'Inkling — free · 1M ctx · multimodal' },
  { id:'thinkingmachines/inkling-small:free', label:'Inkling Small — free · 1M ctx · fast' },
  { id:'nvidia/nemotron-3.5-lightning:free', label:'Nemotron 3.5 Lightning — free · 1M ctx · fast' },
  { id:'nvidia/nemotron-3-super-120b-a12b:free', label:'Nemotron 3 Super 120B — free · hybrid MoE' },
  { id:'nvidia/nemotron-3-ultra-550b-a55b:free', label:'Nemotron 3 Ultra 550B — free · frontier 1M' },
  { id:'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label:'Nemotron 3 Nano Omni 30B — free · reasoning' },
  { id:'google/gemma-4-31b-it:free', label:'Gemma 4 31B — free · 262k' },
  { id:'google/gemma-4-26b-a4b-it:free', label:'Gemma 4 26B A4B — free · MoE 262k' },
  { id:'minimax/minimax-m3:free', label:'MiniMax M3 — free · multimodal 1M' },
  { id:'minimax/minimax-m2.7:free', label:'MiniMax M2.7 — free · 197k' },
  { id:'z-ai/glm-5.2:free', label:'GLM 5.2 — free · reasoning 256k' },
  { id:'cohere/north-mini-code:free', label:'North Mini Code — free · Cohere coding 256k' },
  { id:'liquid/lfm-2.5-2.6b:free', label:'LFM 2.5 2.6B — free · compact reasoning' },
  { id:'dots-studio/dots-3-note-preview:free', label:'Dots 3 Note Preview — free · 512k MoE' },
  { id:'inclusionai/ling-3.0-flash-fin:free', label:'Ling 3.0 Flash Fin — free · finance 262k' },
  { id:'nvidia/nemotron-3.5-content-safety:free', label:'Nemotron 3.5 Content Safety — free · guardrail' },
]

export function mountSetupWizard(opts={}){
  const containerId = opts.containerId || 'setupWizardRoot'
  const getModels = opts.getModels || (()=>[])
  const onFinish = opts.onFinish || (()=>{})
  let root = document.getElementById(containerId)
  if(!root){
    root = document.createElement('div')
    root.id = containerId
    root.className = 'settings-root hidden'
    root.style.zIndex = '41'
    document.body.appendChild(root)
  }
  let step = 0 // 0: welcome, 1: keys, 2: character/voice, 3: graphics/done
  const STEPS = ['Welcome','API Keys','Character','Ready']

  function shouldShow(){
    try { return !get().onboarded } catch { return true }
  }

  async function saveKeysToBackend(){
    const s=get()
    const payload={
      openrouter_api_key: s.openrouterApiKey||'',
      groq_api_key: s.groqApiKey||'',
      elevenlabs_api_key: s.elevenlabsApiKey||'',
      fish_api_key: s.fishApiKey||'',
      openrouter_model: s.openrouterModel||'',
    }
    // don't block onboarding if backend unreachable — localStorage still has them
    try{ await fetch('/api/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}) }catch{}
  }

  function render(){
    const s=get()
    const models=getModels()
    root.innerHTML = `
      <div class="settings-backdrop"></div>
      <div class="settings-modal" role="dialog" aria-modal="true" aria-label="Setup">
        <div class="settings-head">
          <h2>✨ First setup — ${STEPS[step]}</h2>
          <div class="settings-head-actions">
            <span style="font-size:11px;color:var(--muted)">Step ${step+1} / ${STEPS.length}</span>
            <button class="btn ghost small" data-act="skip">Skip</button>
          </div>
        </div>
        <div style="display:flex;gap:6px;padding:10px 16px 0">
          ${STEPS.map((label,i)=>`<span style="flex:1;height:4px;border-radius:999px;background:${i<=step?'var(--accent)':'rgba(255,255,255,0.12)'}"></span>`).join('')}
        </div>
        <div class="settings-body">
          ${step===0 ? `
            <div class="settings-card" style="text-align:center;padding:20px">
              <div style="font-size:28px">◉</div>
              <h3 style="justify-content:center">Welcome to Waifu MMD</h3>
              <p style="color:var(--muted);line-height:1.6;font-size:13px">This wizard saves everything <b>locally</b> — no cloud. Set up API keys to enable real chat & voice, or skip and use offline mock. You can change everything later in <b>⚙ Settings</b> (Ctrl+,).</p>
              <div class="settings-hint">Tip: press <b>,</b> anytime to open Settings. Keys are local-only (backend/user_keys.json).</div>
            </div>
          `:''}
          ${step===1 ? `
            <h3>API Keys — local only</h3>
            <div class="settings-card">
              <div class="settings-hint" style="margin:0 0 10px">Paste keys from openrouter.ai / console.groq.com / elevenlabs.io. Leave blank to use offline mock. All local.</div>
              <div class="settings-row"><label>OpenRouter (primary LLM)
                <input type="password" data-wiz="openrouterApiKey" placeholder="sk-or-v1-..." value="${s.openrouterApiKey||''}">
              </label></div>
              <div class="settings-row"><label>OpenRouter model <span style="font-size:10px;color:var(--muted)">free models — pick or type custom</span>
                <input list="wiz-or-models" data-wiz="openrouterModel" placeholder="google/gemini-2.0-flash-001" value="${(s.openrouterModel||'').replace(/"/g,'&quot;')}" style="font-family:JetBrains Mono,monospace;font-size:12px">
                <datalist id="wiz-or-models">${WIZ_FREE_MODELS.map(m=>`<option value="${m.id}">${m.label}</option>`).join('')}</datalist>
              </label>
                <div class="settings-hint" style="margin:4px 0 0">Free suffix = no charge. Full list at <a href="https://openrouter.ai/models?max_price=0" target="_blank" style="color:var(--accent-2)">openrouter.ai/models?max_price=0</a></div>
              </div>
              <div class="settings-row"><label>Groq (fallback)
                <input type="password" data-wiz="groqApiKey" placeholder="gsk_..." value="${s.groqApiKey||''}">
              </label></div>
              <div class="settings-row"><label>ElevenLabs (premium TTS)
                <input type="password" data-wiz="elevenlabsApiKey" placeholder="elevenlabs key..." value="${s.elevenlabsApiKey||''}">
              </label></div>
              <div class="settings-row"><label>Fish Audio (alt TTS)
                <input type="password" data-wiz="fishApiKey" placeholder="fish key..." value="${s.fishApiKey||''}">
              </label></div>
              <div class="settings-hint">Keys are saved to <code>localStorage</code> + <code>POST /api/keys</code> → <code>backend/user_keys.json</code>. No restart needed.</div>
            </div>
          `:''}
          ${step===2 ? `
            <h3>Character & Voice</h3>
            <div class="settings-model-grid" style="margin-bottom:12px">
              ${models.map(m=>`<button class="model-card ${m.id===s.modelId?'active':''}" data-wiz-model="${m.id}"><div class="avatar">${m.avatar||''}</div><div class="meta"><b>${m.name}</b><span>${m.desc||''}</span></div></button>`).join('')}
            </div>
            <div class="settings-grid">
              <div class="settings-card">
                <h4>Voice</h4>
                <div class="settings-row"><label>EN voice
                  <select data-wiz="ttsVoiceEn">
                    <option value="af_sky" ${s.ttsVoiceEn==='af_sky'?'selected':''}>af_sky</option>
                    <option value="af_bella" ${s.ttsVoiceEn==='af_bella'?'selected':''}>af_bella</option>
                    <option value="af_nicole" ${s.ttsVoiceEn==='af_nicole'?'selected':''}>af_nicole</option>
                    <option value="af_sarah" ${s.ttsVoiceEn==='af_sarah'?'selected':''}>af_sarah</option>
                  </select></label></div>
                <div class="settings-row"><label>JA voice
                  <select data-wiz="ttsVoiceJa">
                    <option value="jf_alpha" ${s.ttsVoiceJa==='jf_alpha'?'selected':''}>jf_alpha</option>
                    <option value="jf_gongitsune" ${s.ttsVoiceJa==='jf_gongitsune'?'selected':''}>jf_gongitsune</option>
                    <option value="jf_sakura" ${s.ttsVoiceJa==='jf_sakura'?'selected':''}>jf_sakura</option>
                    <option value="jf_nezumi" ${s.ttsVoiceJa==='jf_nezumi'?'selected':''}>jf_nezumi</option>
                  </select></label></div>
                <label class="check"><input type="checkbox" data-wiz="premium" ${s.premium?'checked':''}> Premium TTS</label>
              </div>
              <div class="settings-card">
                <h4>Quick prefs</h4>
                <label class="check"><input type="checkbox" data-wiz="shadows" ${s.shadows?'checked':''}> Shadows</label>
                <label class="check"><input type="checkbox" data-wiz="eyeTracking" ${s.eyeTracking?'checked':''}> Eye tracking</label>
                <div class="settings-row"><label>DPR cap
                  <select data-wiz="dprCap">
                    <option value="auto" ${s.dprCap==='auto'?'selected':''}>Auto</option>
                    <option value="1.5" ${s.dprCap==='1.5'?'selected':''}>1.5</option>
                    <option value="2" ${s.dprCap==='2'?'selected':''}>2</option>
                  </select></label></div>
              </div>
            </div>
          `:''}
          ${step===3 ? `
            <div class="settings-card" style="text-align:center;padding:20px">
              <div style="font-size:24px">♡</div>
              <h3 style="justify-content:center">You're all set</h3>
              <p style="color:var(--muted);line-height:1.6;font-size:13px">Keys (if any) are saved locally. Hit <b>Finish</b> to start — you can reopen setup via <b>⚙ Settings → App → Re-run setup</b> or press <b>,</b>.</p>
              <div class="settings-hint" style="text-align:left">Backend health: <span id="wizHealth">checking…</span></div>
            </div>
          `:''}
        </div>
        <div style="display:flex;gap:8px;justify-content:space-between;padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06)">
          <button class="btn ghost small" data-act="back" ${step===0?'disabled style="opacity:0.4"':''}>‹ Back</button>
          <div style="display:flex;gap:8px">
            ${step<STEPS.length-1 ? `<button class="btn primary small" data-act="next">Next ›</button>` : `<button class="btn primary small" data-act="finish">Finish ♡</button>`}
          </div>
        </div>
      </div>
    `
    bind()
    if(step===3){
      fetch('/health').then(r=>r.json()).then(h=>{
        const el=document.getElementById('wizHealth')
        if(el) el.textContent = h ? `ok • ${h.llm_provider}/${h.tts_provider} • keys o:${!!h.has_openrouter} g:${!!h.has_groq} e:${!!h.has_elevenlabs}` : 'unreachable'
      }).catch(()=>{
        const el=document.getElementById('wizHealth')
        if(el) el.textContent='unreachable — check backend :8000'
      })
    }
  }
  function bind(){
    root.querySelector('[data-act="skip"]')?.addEventListener('click', ()=>{
      setOnboarded(true)
      close()
      onFinish({ skipped:true })
    })
    root.querySelector('[data-act="back"]')?.addEventListener('click', ()=>{
      if(step>0){ step--; render() }
    })
    root.querySelector('[data-act="next"]')?.addEventListener('click', async ()=>{
      // persist current step fields before advancing
      collectStep()
      if(step===1) await saveKeysToBackend()
      if(step<STEPS.length-1){ step++; render() }
    })
    root.querySelector('[data-act="finish"]')?.addEventListener('click', async ()=>{
      collectStep()
      await saveKeysToBackend()
      setOnboarded(true)
      close()
      onFinish({ skipped:false })
    })
    // live bindings
    root.querySelectorAll('[data-wiz]').forEach(el=>{
      const field=el.dataset.wiz
      const isChk=el.type==='checkbox'
      const ev=(isChk||el.tagName==='SELECT')?'change':'input'
      el.addEventListener(ev, ()=>{
        const v=isChk?el.checked:el.value
        set({ [field]: v })
      })
    })
    root.querySelectorAll('[data-wiz-model]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        set({ modelId: btn.dataset.wizModel })
        render()
      })
    })
    root.querySelector('.settings-backdrop')?.addEventListener('click', ()=>{
      // don't close on backdrop during setup — force choice
    })
  }
  function collectStep(){
    // keys step already bound via data-wiz listeners, but ensure values flushed
    root.querySelectorAll('[data-wiz]').forEach(el=>{
      const field=el.dataset.wiz
      const isChk=el.type==='checkbox'
      const v=isChk?el.checked:el.value
      set({ [field]: v })
    })
  }
  function open(){
    step=0
    render()
    root.classList.remove('hidden')
    requestAnimationFrame(()=> root.classList.add('open'))
    document.addEventListener('keydown', onKey)
  }
  function close(){
    root.classList.remove('open')
    setTimeout(()=> root.classList.add('hidden'), 180)
    document.removeEventListener('keydown', onKey)
  }
  function onKey(e){ if(e.key==='Escape'){ /* block escape during onboarding, only skip */ } }
  function isOpen(){ return !root.classList.contains('hidden') }

  root.classList.add('hidden')
  return { open, close, isOpen, shouldShow, render }
}
