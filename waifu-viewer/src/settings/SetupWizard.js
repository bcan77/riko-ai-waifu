/**
 * SetupWizard — macOS-style first-boot onboarding
 * Steps: 1 Language (EN/TR) • 2 API Keys • 3 Character chooser • Done
 * Blue, translucent, sleek SF-like icons, full-screen.
 */
import { get, set, setOnboarded } from './store.js'

const I18N = {
  en: {
    welcome: 'Welcome',
    subtitle: 'Set up your Waifu MMD in 3 quick steps',
    stepLang: 'Language',
    stepKeys: 'API Keys',
    stepChar: 'Character',
    langTitle: 'Choose your language',
    langDesc: 'You can change this anytime in Settings',
    langEn: 'English',
    langTr: 'Türkçe',
    keysTitle: 'Connect your AI',
    keysDesc: 'Paste keys from your providers. Everything stays <b>local</b> — no cloud. Skip to use offline mock.',
    keysOpenRouter: 'OpenRouter <span style="opacity:.6;font-weight:400">— primary LLM</span>',
    keysOpenRouterPh: 'sk-or-v1-…',
    keysModel: 'Model',
    keysGroq: 'Groq <span style="opacity:.6;font-weight:400">— fallback LLM</span>',
    keysEleven: 'ElevenLabs <span style="opacity:.6;font-weight:400">— premium voice</span>',
    keysFish: 'Fish Audio <span style="opacity:.6;font-weight:400">— alternative voice</span>',
    keysHint: 'Keys are saved to <code>localStorage</code> + <code>POST /api/keys</code>. Leave blank for mock.',
    keysFree: 'Free models end with <code>:free</code>. Browse at',
    charTitle: 'Choose your companion',
    charDesc: 'You can switch anytime. Outfit is remembered per character.',
    voiceEn: 'English voice',
    voiceJa: 'Japanese voice',
    premium: 'Premium TTS',
    doneTitle: "You're all set",
    doneDesc: 'Keys (if any) are saved locally. Hit <b>Start</b> to enter — reopen setup via <b>⚙ Settings → Re-run setup</b> or <b>,</b>.',
    health: 'Backend',
    back: 'Back',
    next: 'Continue',
    finish: 'Start ♡',
    skip: 'Skip for now',
    checking: 'checking…',
  },
  tr: {
    welcome: 'Hoş geldin',
    subtitle: 'Waifu MMD’yi 3 adımda kur',
    stepLang: 'Dil',
    stepKeys: 'API Anahtarları',
    stepChar: 'Karakter',
    langTitle: 'Dilini seç',
    langDesc: 'Bunu daha sonra Ayarlar’dan değiştirebilirsin',
    langEn: 'English',
    langTr: 'Türkçe',
    keysTitle: 'Yapay zekâyı bağla',
    keysDesc: 'Anahtarlarını yapıştır. Her şey <b>yerel</b> kalır — bulut yok. Atla ve çevrimdışı mock ile devam et.',
    keysOpenRouter: 'OpenRouter <span style="opacity:.6;font-weight:400">— ana LLM</span>',
    keysOpenRouterPh: 'sk-or-v1-…',
    keysModel: 'Model',
    keysGroq: 'Groq <span style="opacity:.6;font-weight:400">— yedek LLM</span>',
    keysEleven: 'ElevenLabs <span style="opacity:.6;font-weight:400">— premium ses</span>',
    keysFish: 'Fish Audio <span style="opacity:.6;font-weight:400">— alternatif ses</span>',
    keysHint: 'Anahtarlar <code>localStorage</code> + <code>POST /api/keys</code> ile saklanır. Mock için boş bırak.',
    keysFree: 'Ücretsiz modeller <code>:free</code> ile biter. Göz at:',
    charTitle: 'Yoldaşını seç',
    charDesc: 'İstediğin zaman değiştirebilirsin. Kıyafet karakter bazında hatırlanır.',
    voiceEn: 'İngilizce ses',
    voiceJa: 'Japonca ses',
    premium: 'Premium TTS',
    doneTitle: 'Her şey hazır',
    doneDesc: 'Anahtarlar (varsa) yerel olarak kaydedildi. <b>Başlat</b> ile gir — kurulumu <b>⚙ Ayarlar → Kurulumu tekrarla</b> veya <b>,</b> ile yeniden açabilirsin.',
    health: 'Backend',
    back: 'Geri',
    next: 'Devam',
    finish: 'Başlat ♡',
    skip: 'Şimdilik atla',
    checking: 'kontrol ediliyor…',
  }
}

const WIZ_FREE_MODELS = [
  { id:'google/gemini-2.0-flash-001', label:'Gemini 2.0 Flash (default · not free)' },
  { id:'poolside/laguna-xs-2.1:free', label:'Laguna XS 2.1 — free · 33B · 262k' },
  { id:'poolside/laguna-s-2.1:free', label:'Laguna S 2.1 — free · 118B · 262k' },
  { id:'thinkingmachines/inkling:free', label:'Inkling — free · 1M · multimodal' },
  { id:'thinkingmachines/inkling-small:free', label:'Inkling Small — free · fast' },
  { id:'nvidia/nemotron-3.5-lightning:free', label:'Nemotron Lightning — free · fast' },
  { id:'nvidia/nemotron-3-super-120b-a12b:free', label:'Nemotron Super 120B — free · MoE' },
  { id:'google/gemma-4-31b-it:free', label:'Gemma 4 31B — free · 262k' },
  { id:'google/gemma-4-26b-a4b-it:free', label:'Gemma 4 26B A4B — free · MoE' },
  { id:'z-ai/glm-5.2:free', label:'GLM 5.2 — free · 256k' },
]

function t(key){
  try{
    const lang = get().language || 'en'
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key
  }catch{ return I18N.en[key] || key }
}

export function mountSetupWizard(opts={}){
  const containerId = opts.containerId || 'setupWizardRoot'
  const getModels = opts.getModels || (()=>[])
  const onFinish = opts.onFinish || (()=>{})
  let root = document.getElementById(containerId)
  if(!root){
    root = document.createElement('div')
    root.id = containerId
    root.className = 'setup-root hidden'
    document.body.appendChild(root)
  }
  let step = 0 // 0 lang, 1 keys, 2 char, 3 done
  const STEPS = ['lang','keys','char','done']

  function shouldShow(){ try{ return !get().onboarded }catch{ return true } }

  async function saveKeysToBackend(){
    const s=get()
    const payload={
      openrouter_api_key: s.openrouterApiKey||'',
      groq_api_key: s.groqApiKey||'',
      elevenlabs_api_key: s.elevenlabsApiKey||'',
      fish_api_key: s.fishApiKey||'',
      openrouter_model: s.openrouterModel||'',
    }
    try{ await fetch('/api/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}) }catch{}
  }

  function render(){
    const s=get()
    const models=getModels()
    const curLang = s.language || 'en'
    const tr = (k)=> {
      const lang = curLang
      return (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k
    }
    // macOS left sidebar icons (SF-like, sleek, blue)
    const icons = [
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"/><path d="M12 2c2.5 2.8 3.9 6.2 3.9 10s-1.4 7.2-3.9 10c-2.5-2.8-3.9-6.2-3.9-10S9.5 4.8 12 2z"/></svg>`,
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1 0 7.78a5.5 5.5 0 0 1 0-7.78z"/><path d="M14 7l-3 3"/><path d="M5 21l4-4"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M12 11l2 2l4-4" stroke-width="1.4"/></svg>`,
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/><circle cx="12" cy="12" r="10" stroke-width="1.4" opacity=".35"/></svg>`,
    ]
    const labels = [tr('stepLang'), tr('stepKeys'), tr('stepChar'), '✓']
    root.innerHTML = `
      <div class="setup-backdrop"></div>
      <div class="setup-card" role="dialog" aria-modal="true">
        <!-- top bar like macOS traffic lights -->
        <div class="setup-topbar">
          <div class="setup-traffic">
            <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
          </div>
          <div class="setup-titlebar">
            <span class="setup-title">${tr('welcome')}</span>
            <span class="setup-subtitle">${tr('subtitle')}</span>
          </div>
          <button class="setup-skip" data-act="skip">${tr('skip')}</button>
        </div>
        <div class="setup-body">
          <aside class="setup-sidebar">
            ${STEPS.map((id,i)=>`
              <div class="setup-step ${i===step?'active':''} ${i<step?'done':''}" data-step="${i}">
                <div class="setup-step-icon ${i===step?'active':''}">${icons[i]}</div>
                <div class="setup-step-meta">
                  <b>${labels[i]}</b>
                  <span>${i<step?'✓ Completed': i===step?'In progress':'Pending'}</span>
                </div>
                ${i<step?`<span class="setup-check">✓</span>`:''}
              </div>
            `).join('')}
            <div class="setup-sidebar-foot">
              <div class="setup-progress">
                <div class="setup-progress-bar"><i style="width:${((step+1)/STEPS.length*100).toFixed(0)}%"></i></div>
                <span>Step ${step+1} of ${STEPS.length}</span>
              </div>
            </div>
          </aside>
          <main class="setup-main">
            ${step===0 ? `
              <div class="setup-pane">
                <div class="setup-pane-head">
                  <div class="setup-icon-wrap blue"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"/></svg></div>
                  <h2>${tr('langTitle')}</h2>
                  <p>${tr('langDesc')}</p>
                </div>
                <div class="setup-lang-grid">
                  <button class="setup-lang-card ${curLang==='en'?'active':''}" data-lang="en">
                    <div class="lang-flag">🇺🇸</div>
                    <div class="lang-meta"><b>${tr('langEn')}</b><span>English · Default</span></div>
                    <div class="lang-check">${curLang==='en'?'✓':''}</div>
                  </button>
                  <button class="setup-lang-card ${curLang==='tr'?'active':''}" data-lang="tr">
                    <div class="lang-flag">🇹🇷</div>
                    <div class="lang-meta"><b>${tr('langTr')}</b><span>Türkçe</span></div>
                    <div class="lang-check">${curLang==='tr'?'✓':''}</div>
                  </button>
                </div>
                <div class="setup-hint">Selected: <b>${curLang==='tr'?'Türkçe':'English'}</b> — the UI will use this language after setup.</div>
              </div>
            `:''}
            ${step===1 ? `
              <div class="setup-pane">
                <div class="setup-pane-head">
                  <div class="setup-icon-wrap blue"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7"><path d="M21 2l-2 2"/><path d="M7.5 10.5a5.5 5.5 0 1 0 7.78 0a5.5 5.5 0 0 0-7.78 0z"/><path d="M14 7l-3 3"/><path d="M5 21l4-4"/></svg></div>
                  <h2>${tr('keysTitle')}</h2>
                  <p>${tr('keysDesc')}</p>
                </div>
                <div class="setup-keys">
                  <label class="setup-field">
                    <span class="setup-field-label">${tr('keysOpenRouter')}</span>
                    <div class="setup-input-wrap">
                      <input type="password" data-wiz="openrouterApiKey" placeholder="${tr('keysOpenRouterPh')}" value="${(s.openrouterApiKey||'').replace(/"/g,'&quot;')}" autocomplete="off" spellcheck="false">
                      <button type="button" class="setup-eye" data-eye="openrouterApiKey">👁</button>
                    </div>
                  </label>
                  <label class="setup-field">
                    <span class="setup-field-label">${tr('keysModel')}</span>
                    <input list="wiz-or-models" data-wiz="openrouterModel" placeholder="google/gemini-2.0-flash-001" value="${(s.openrouterModel||'').replace(/"/g,'&quot;')}" style="font-family:JetBrains Mono,monospace;font-size:12px">
                    <datalist id="wiz-or-models">${WIZ_FREE_MODELS.map(m=>`<option value="${m.id}"></option>`).join('')}</datalist>
                    <span class="setup-field-hint">${tr('keysFree')} <a href="https://openrouter.ai/models?max_price=0" target="_blank">openrouter.ai</a></span>
                  </label>
                  <div class="setup-keys-grid">
                    <label class="setup-field">
                      <span class="setup-field-label">${tr('keysGroq')}</span>
                      <div class="setup-input-wrap">
                        <input type="password" data-wiz="groqApiKey" placeholder="gsk_…" value="${(s.groqApiKey||'').replace(/"/g,'&quot;')}">
                        <button type="button" class="setup-eye" data-eye="groqApiKey">👁</button>
                      </div>
                    </label>
                    <label class="setup-field">
                      <span class="setup-field-label">${tr('keysEleven')}</span>
                      <div class="setup-input-wrap">
                        <input type="password" data-wiz="elevenlabsApiKey" placeholder="xi-…" value="${(s.elevenlabsApiKey||'').replace(/"/g,'&quot;')}">
                        <button type="button" class="setup-eye" data-eye="elevenlabsApiKey">👁</button>
                      </div>
                    </label>
                  </div>
                  <label class="setup-field">
                    <span class="setup-field-label">${tr('keysFish')}</span>
                    <div class="setup-input-wrap">
                      <input type="password" data-wiz="fishApiKey" placeholder="fish…" value="${(s.fishApiKey||'').replace(/"/g,'&quot;')}">
                      <button type="button" class="setup-eye" data-eye="fishApiKey">👁</button>
                    </div>
                  </label>
                  <div class="setup-hint">${tr('keysHint')}</div>
                </div>
              </div>
            `:''}
            ${step===2 ? `
              <div class="setup-pane">
                <div class="setup-pane-head">
                  <div class="setup-icon-wrap blue"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.7"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11l-2 2l-4-4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
                  <h2>${tr('charTitle')}</h2>
                  <p>${tr('charDesc')}</p>
                </div>
                <div class="setup-char-grid">
                  ${models.map(m=>{
                    const isActive = m.id===s.modelId
                    const outfits = m.outfits || [{id:'default', name:'Default'}]
                    return `
                      <button class="setup-char-card ${isActive?'active':''}" data-wiz-model="${m.id}">
                        <div class="setup-char-avatar">${m.avatar||m.name[0]}</div>
                        <div class="setup-char-meta">
                          <b>${m.name}</b>
                          <span>${m.desc||''}</span>
                          <small>${outfits.length>1 ? outfits.map(o=>o.name).join(' • ') : m.jp||''}</small>
                        </div>
                        <div class="setup-char-check">${isActive?'✓':''}</div>
                      </button>
                    `
                  }).join('')}
                </div>
                ${(()=>{
                  const curM = models.find(m=>m.id===s.modelId)
                  const outfits = curM?.outfits || []
                  if(outfits.length<=1) return ''
                  const curOut = s.outfitId || 'default'
                  return `
                    <div class="setup-outfit-row">
                      <span class="setup-field-label" style="margin-top:10px;display:block">Outfit</span>
                      <div class="setup-outfit-grid">
                        ${outfits.map(o=>`
                          <button class="setup-outfit-btn ${o.id===curOut?'active':''}" data-wiz-outfit="${o.id}">${o.name}</button>
                        `).join('')}
                      </div>
                    </div>
                  `
                })()}
                <div class="setup-voice-row">
                  <label class="setup-field small">
                    <span class="setup-field-label">${tr('voiceEn')}</span>
                    <select data-wiz="ttsVoiceEn">
                      <option value="af_sky" ${s.ttsVoiceEn==='af_sky'?'selected':''}>af_sky — Ellen</option>
                      <option value="af_bella" ${s.ttsVoiceEn==='af_bella'?'selected':''}>af_bella — Jane</option>
                      <option value="af_nicole" ${s.ttsVoiceEn==='af_nicole'?'selected':''}>af_nicole — Zhu</option>
                      <option value="af_sarah" ${s.ttsVoiceEn==='af_sarah'?'selected':''}>af_sarah</option>
                    </select>
                  </label>
                  <label class="setup-field small">
                    <span class="setup-field-label">${tr('voiceJa')}</span>
                    <select data-wiz="ttsVoiceJa">
                      <option value="jf_alpha" ${s.ttsVoiceJa==='jf_alpha'?'selected':''}>jf_alpha</option>
                      <option value="jf_gongitsune" ${s.ttsVoiceJa==='jf_gongitsune'?'selected':''}>jf_gongitsune</option>
                      <option value="jf_sakura" ${s.ttsVoiceJa==='jf_sakura'?'selected':''}>jf_sakura</option>
                      <option value="jf_nezumi" ${s.ttsVoiceJa==='jf_nezumi'?'selected':''}>jf_nezumi</option>
                    </select>
                  </label>
                  <label class="setup-check">
                    <input type="checkbox" data-wiz="premium" ${s.premium?'checked':''}>
                    <span>${tr('premium')}</span>
                  </label>
                </div>
              </div>
            `:''}
            ${step===3 ? `
              <div class="setup-pane center">
                <div class="setup-icon-wrap blue large">♡</div>
                <h2>${tr('doneTitle')}</h2>
                <p>${tr('doneDesc')}</p>
                <div class="setup-health">
                  <span>${tr('health')}:</span>
                  <span id="wizHealth">${tr('checking')}</span>
                </div>
              </div>
            `:''}
          </main>
        </div>
        <div class="setup-footer">
          <button class="btn ghost" data-act="back" ${step===0?'disabled':''}>‹ ${tr('back')}</button>
          <div class="setup-footer-right">
            ${step<3 ? `<button class="btn primary setup-next" data-act="next">${tr('next')} ›</button>` : `<button class="btn primary setup-next" data-act="finish">${tr('finish')}</button>`}
          </div>
        </div>
      </div>
    `
    bind()
    if(step===3){
      fetch('/health').then(r=>r.json()).then(h=>{
        const el=document.getElementById('wizHealth')
        if(el) el.textContent = h ? `ok • ${h.llm_provider}/${h.tts_provider} • o:${!!h.has_openrouter} g:${!!h.has_groq} e:${!!h.has_elevenlabs}` : 'unreachable'
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
      collectStep()
      if(step===1) await saveKeysToBackend()
      if(step<3){ step++; render() }
    })
    root.querySelector('[data-act="finish"]')?.addEventListener('click', async ()=>{
      collectStep()
      await saveKeysToBackend()
      setOnboarded(true)
      close()
      onFinish({ skipped:false })
    })
    root.querySelectorAll('[data-lang]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        set({ language: btn.dataset.lang })
        render()
      })
    })
    root.querySelectorAll('[data-wiz]').forEach(el=>{
      const field=el.dataset.wiz
      const isChk=el.type==='checkbox'
      const ev=(isChk||el.tagName==='SELECT')?'change':'input'
      el.addEventListener(ev, ()=>{
        const v=isChk?el.checked:el.value
        set({ [field]: v })
      })
    })
    root.querySelectorAll('[data-wiz-outfit]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        set({ outfitId: btn.dataset.wizOutfit })
        render()
      })
    })
    root.querySelectorAll('[data-wiz-model]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        set({ modelId: btn.dataset.wizModel })
        // reset outfit to default for new model
        try{
          const models = getModels()
          const m = models.find(x=>x.id===btn.dataset.wizModel)
          const outfits = m?.outfits || []
          const cur = get().outfitId
          if(!outfits.some(o=>o.id===cur)) set({ outfitId: outfits[0]?.id || 'default' })
        }catch{}
        render()
      })
    })
    root.querySelectorAll('[data-eye]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const f = btn.dataset.eye
        const inp = root.querySelector(`[data-wiz="${f}"]`)
        if(inp){ inp.type = inp.type==='password' ? 'text' : 'password'; btn.textContent = inp.type==='password' ? '👁' : '🙈' }
      })
    })
    root.querySelector('.setup-backdrop')?.addEventListener('click', ()=>{})
  }

  function collectStep(){
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
    setTimeout(()=> root.classList.add('hidden'), 200)
    document.removeEventListener('keydown', onKey)
  }
  function onKey(e){ if(e.key==='Escape'){ /* block esc, use skip */ } }
  function isOpen(){ return !root.classList.contains('hidden') }

  root.classList.add('hidden')
  return { open, close, isOpen, shouldShow, render, t }
}
