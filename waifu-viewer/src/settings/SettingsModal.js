/**
 * SettingsModal — tabbed settings surface. Reuses editor.css modal shell tokens
 * but with its own namespace (settings-*). Mounts into #settingsRoot or body.
 * Wired to settings/store.js; main.js subscribes to apply live changes.
 */
import { DEFAULTS, get, set, reset, exportJson, importJson, onChange } from './store.js'
import { fetchBackgrounds as fetchBgList } from '../services/background-manager.js'

const FREE_MODELS = [
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

const TABS = [
  { id:'characters', label:'Characters' },
  { id:'animation',  label:'Animation' },
  { id:'physics',    label:'Physics & Motion' },
  { id:'graphics',   label:'Graphics' },
  { id:'camera',     label:'Camera' },
  { id:'audio',      label:'Audio & Voice' },
  { id:'keys',       label:'API Keys' },
  { id:'app',        label:'App & Display' },
]

export function mountSettingsModal(opts = {}){
  const containerId = opts.containerId || 'settingsRoot'
  const modelsGetter = opts.getModels || (()=>[])
  const animsGetter  = opts.getAnims  || (()=>[])
  const onAction     = opts.onAction  || (()=>{})

  let root = document.getElementById(containerId)
  if(!root){
    root = document.createElement('div')
    root.id = containerId
    root.className = 'settings-root hidden'
    document.body.appendChild(root)
  }

  let activeTab = 'characters'
  let unsub = null

  function render(){
    const s = get()
    root.innerHTML = `
      <div class="settings-backdrop" data-close></div>
      <div class="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="settings-head">
          <h2>Settings</h2>
          <div class="settings-head-actions">
            <button class="btn ghost small" data-act="export">Export</button>
            <button class="btn ghost small" data-act="import">Import</button>
            <button class="btn small" id="settingsClose">✕</button>
          </div>
        </div>
        <div class="settings-tabs" role="tablist">
          ${TABS.map(t=>`<button class="settings-tab ${t.id===activeTab?'active':''}" role="tab" aria-selected="${t.id===activeTab}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="settings-body">
          <div class="settings-panel ${activeTab==='characters'?'active':''}" data-panel="characters">
            <h3>Characters</h3>
            <div class="settings-model-grid" id="setModelGrid"></div>
            <div id="setOutfitGrid" class="outfit-picker" style="margin-top:8px"></div>
            <div class="settings-card" style="margin-top:10px">
              <h4>WPKGs</h4>
              <div class="settings-actions">
                <button class="btn small" data-act="wpkg-open">◨ Open .wpkg Editor</button>
                <button class="btn small ghost" data-act="wpkg-reload">↺ Reload WPKGs</button>
              </div>
              <div class="settings-row"><label>Affinity <span class="val" data-bind="affinity">${s.affinity.toFixed(2)}</span>
                <input type="range" min="0" max="1" step="0.01" value="${s.affinity}" data-field="affinity"></label>
              </div>
              <div class="settings-hint">Tip: head-pat in 3D view also bumps affinity ♡</div>
            </div>
          </div>

          <div class="settings-panel ${activeTab==='animation'?'active':''}" data-panel="animation">
            <h3>Animation</h3>
            <div class="settings-grid">
              <div class="settings-card">
                <h4>Playback</h4>
                <div class="settings-row"><label>Speed <span data-bind="speed">${s.speed.toFixed(2)}×</span>
                  <input type="range" min="0.1" max="2" step="0.05" value="${s.speed}" data-field="speed"></label>
                </div>
                <label class="check"><input type="checkbox" data-field="loop" ${s.loop?'checked':''}> Loop</label>
                <label class="check"><input type="checkbox" data-field="mirror" ${s.mirror?'checked':''}> Mirror</label>
                <div class="settings-actions">
                  <button class="btn small primary" data-act="play">▶ Play</button>
                  <button class="btn small" data-act="pause">⏸ Pause</button>
                  <button class="btn small ghost" data-act="reset-pose">↺ Reset pose</button>
                </div>
              </div>
              <div class="settings-card">
                <h4>Animations</h4>
                <div id="setAnimList" class="settings-vmd-mini"></div>
                <div class="settings-hint">Live-synced with <code>VMD_Animations/</code>. Drag & drop a .vmd onto the stage also works.</div>
              </div>
            </div>
          </div>

          <div class="settings-panel ${activeTab==='physics'?'active':''}" data-panel="physics">
            <h3>Physics & Motion</h3>
            <div class="settings-grid">
              <div class="settings-card">
                <h4>Simulation</h4>
                <label class="check"><input type="checkbox" data-field="physics" ${s.physics?'checked':''}> Physics (hair / cloth)</label>
                <label class="check"><input type="checkbox" data-field="ik" ${s.ik?'checked':''}> IK (feet / hands)</label>
                <div class="settings-row"><label>Gravity <span data-bind="gravity">${s.gravity}</span>
                  <input type="range" min="-40" max="0" step="0.5" value="${s.gravity}" data-field="gravity"></label>
                </div>
              </div>
              <div class="settings-card">
                <h4>Interaction</h4>
                <label class="check"><input type="checkbox" data-field="eyeTracking" ${s.eyeTracking?'checked':''}> Eye tracking (follow mouse)</label>
                <label class="check"><input type="checkbox" data-field="hitboxing" ${s.hitboxing?'checked':''}> Hitboxing (poke / head-pat)</label>
                <div class="settings-hint">Disable either if you want a fully static pose or to save CPU.</div>
              </div>
            </div>
          </div>

          <div class="settings-panel ${activeTab==='graphics'?'active':''}" data-panel="graphics">
            <h3>Graphics</h3>
            <div class="settings-grid">
              <div class="settings-card">
                <h4>Lighting</h4>
                <div class="settings-row"><label>Key intensity <span data-bind="keyIntensity">${s.keyIntensity.toFixed(1)}</span>
                  <input type="range" min="0" max="5" step="0.1" value="${s.keyIntensity}" data-field="keyIntensity"></label></div>
                <div class="settings-row"><label>Fill <span data-bind="fillIntensity">${s.fillIntensity.toFixed(2)}</span>
                  <input type="range" min="0" max="2" step="0.05" value="${s.fillIntensity}" data-field="fillIntensity"></label></div>
                <div class="settings-row"><label>Rim <span data-bind="rimIntensity">${s.rimIntensity.toFixed(1)}</span>
                  <input type="range" min="0" max="3" step="0.1" value="${s.rimIntensity}" data-field="rimIntensity"></label></div>
                <div class="settings-row"><label>Back <span data-bind="backIntensity">${s.backIntensity.toFixed(2)}</span>
                  <input type="range" min="0" max="2" step="0.05" value="${s.backIntensity}" data-field="backIntensity"></label></div>
                <div class="settings-row"><label>Ambient <span data-bind="ambientIntensity">${s.ambientIntensity.toFixed(2)}</span>
                  <input type="range" min="0" max="1.5" step="0.05" value="${s.ambientIntensity}" data-field="ambientIntensity"></label></div>
                <div class="settings-row"><label>Exposure <span data-bind="exposure">${s.exposure.toFixed(2)}</span>
                  <input type="range" min="0.3" max="2" step="0.05" value="${s.exposure}" data-field="exposure"></label></div>
                <div class="settings-row" style="gap:8px; flex-wrap:wrap">
                  <span style="font-size:12px; opacity:0.7; margin-right:6px">Presets:</span>
                  <button class="btn btn-sm" data-preset="game" style="padding:4px 10px; font-size:12px">Game (ZZZ)</button>
                  <button class="btn btn-sm" data-preset="villa" style="padding:4px 10px; font-size:12px">Villa</button>
                  <button class="btn btn-sm" data-preset="studio" style="padding:4px 10px; font-size:12px">Studio</button>
                </div>
              </div>
              <div class="settings-card">
                <h4>Quality</h4>
                <label class="check"><input type="checkbox" data-field="shadows" ${s.shadows?'checked':''}> Shadows</label>
                <label class="check"><input type="checkbox" data-field="ground" ${s.ground?'checked':''}> Ground / grid</label>
                <div class="settings-row"><label>DPR cap
                  <select data-field="dprCap">
                    <option value="auto" ${s.dprCap==='auto'?'selected':''}>Auto</option>
                    <option value="1.25" ${s.dprCap==='1.25'?'selected':''}>1.25</option>
                    <option value="1.5" ${s.dprCap==='1.5'?'selected':''}>1.5</option>
                    <option value="1.75" ${s.dprCap==='1.75'?'selected':''}>1.75</option>
                    <option value="2" ${s.dprCap==='2'?'selected':''}>2</option>
                  </select></label></div>
                <div class="settings-row"><label>Shadow resolution
                  <select data-field="shadowRes">
                    <option value="auto" ${s.shadowRes==='auto'?'selected':''}>Auto</option>
                    <option value="1024" ${s.shadowRes==='1024'?'selected':''}>1024</option>
                    <option value="2048" ${s.shadowRes==='2048'?'selected':''}>2048</option>
                  </select></label></div>
                <div class="settings-row"><label>FPS cap
                  <select data-field="fpsCap">
                    <option value="0" ${Number(s.fpsCap)===0?'selected':''}>Uncapped (~90)</option>
                    <option value="60" ${Number(s.fpsCap)===60?'selected':''}>60</option>
                    <option value="30" ${Number(s.fpsCap)===30?'selected':''}>30</option>
                  </select></label></div>
                <div class="settings-hint">Auto DPR picks 1.25–2 based on window area (dynamic resolution). Override here if you want sharper or cheaper rendering.</div>
              </div>
            </div>
            <!-- Background picker — was missing entirely, so "background doesn't show up in settings" -->
            <div class="settings-card" style="margin-top:10px">
              <h4>Background</h4>
              <div id="setBgGrid" class="settings-bg-grid"><div class="settings-hint" style="margin:0">Loading backgrounds…</div></div>
              <div class="settings-hint">Pick a 3D room or image from <code>backgrounds/</code>. Also available in the left drawer → Scene tab.</div>
            </div>
          </div>

          <div class="settings-panel ${activeTab==='camera'?'active':''}" data-panel="camera">
            <h3>Camera & Controls</h3>
            <div class="settings-grid">
              <div class="settings-card">
                <h4>Camera</h4>
                <div class="settings-row"><label>FOV <span data-bind="fov">${s.fov}°</span>
                  <input type="range" min="20" max="75" step="1" value="${s.fov}" data-field="fov"></label></div>
                <label class="check"><input type="checkbox" data-field="autoRotate" ${s.autoRotate?'checked':''}> Auto orbit</label>
                <div class="settings-row"><label>Damping <span data-bind="dampingFactor">${s.dampingFactor.toFixed(3)}</span>
                  <input type="range" min="0.01" max="0.2" step="0.005" value="${s.dampingFactor}" data-field="dampingFactor"></label></div>
                <div class="settings-row inline">
                  <label>Min dist <input type="number" min="1" max="20" step="0.5" value="${s.minDistance}" data-field="minDistance"></label>
                  <label>Max dist <input type="number" min="10" max="80" step="1" value="${s.maxDistance}" data-field="maxDistance"></label>
                </div>
                <div class="settings-actions">
                  <button class="btn small" data-act="cam-front">Front</button>
                  <button class="btn small" data-act="cam-side">Side</button>
                  <button class="btn small" data-act="cam-back">Back</button>
                  <button class="btn small" data-act="cam-top">Top</button>
                </div>
              </div>
              <div class="settings-card">
                <h4>Controls</h4>
                <div class="settings-hint">Drag to orbit • Scroll to zoom • Right-drag to pan.<br>Damping controls how “loose” the camera feels. Lower = snappier.</div>
                <div class="settings-actions" style="margin-top:10px">
                  <button class="btn small ghost" data-act="reset-camera">Reset camera</button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-panel ${activeTab==='audio'?'active':''}" data-panel="audio">
            <h3>Audio & Voice</h3>
            <div class="settings-grid">
              <div class="settings-card">
                <h4>Voice</h4>
                <div class="settings-row"><label>Voice EN
                  <select data-field="ttsVoiceEn">
                    <option value="af_sky" ${s.ttsVoiceEn==='af_sky'?'selected':''}>af_sky</option>
                    <option value="af_bella" ${s.ttsVoiceEn==='af_bella'?'selected':''}>af_bella</option>
                    <option value="af_nicole" ${s.ttsVoiceEn==='af_nicole'?'selected':''}>af_nicole</option>
                    <option value="af_sarah" ${s.ttsVoiceEn==='af_sarah'?'selected':''}>af_sarah</option>
                  </select></label></div>
                <div class="settings-row"><label>Voice JA
                  <select data-field="ttsVoiceJa">
                    <option value="jf_alpha" ${s.ttsVoiceJa==='jf_alpha'?'selected':''}>jf_alpha</option>
                    <option value="jf_gongitsune" ${s.ttsVoiceJa==='jf_gongitsune'?'selected':''}>jf_gongitsune</option>
                    <option value="jf_sakura" ${s.ttsVoiceJa==='jf_sakura'?'selected':''}>jf_sakura</option>
                    <option value="jf_nezumi" ${s.ttsVoiceJa==='jf_nezumi'?'selected':''}>jf_nezumi</option>
                  </select></label></div>
                <label class="check"><input type="checkbox" data-field="premium" ${s.premium?'checked':''}> Premium TTS</label>
                <div class="settings-row"><label>Prosody rate <span data-bind="prosodyRate">${s.prosodyRate.toFixed(2)}</span>
                  <input type="range" min="0.7" max="1.4" step="0.05" value="${s.prosodyRate}" data-field="prosodyRate"></label></div>
                <div class="settings-row"><label>Prosody pitch <span data-bind="prosodyPitch">${s.prosodyPitch}</span>
                  <input type="range" min="-6" max="6" step="1" value="${s.prosodyPitch}" data-field="prosodyPitch"></label></div>
              </div>
              <div class="settings-card">
                <h4>Speech & Chat</h4>
                <div class="settings-row"><label>STT language
                  <select data-field="sttLang">
                    <option value="auto" ${s.sttLang==='auto'?'selected':''}>Auto</option>
                    <option value="en-US" ${s.sttLang==='en-US'?'selected':''}>en-US</option>
                    <option value="ja-JP" ${s.sttLang==='ja-JP'?'selected':''}>ja-JP</option>
                  </select></label></div>
                <label class="check"><input type="checkbox" data-field="bargeIn" ${s.bargeIn?'checked':''}> Mic barge-in (cut TTS)</label>
                <div class="settings-hint">Premium routes through the server’s premium TTS provider when available. STT auto picks ja-JP if input contains kana/kanji.</div>
              </div>
            </div>
          </div>

          <div class="settings-panel ${activeTab==='keys'?'active':''}" data-panel="keys">
            <h3>API Keys <span style="font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:none;color:var(--muted2)"> — local only, saved to backend/user_keys.json + localStorage</span></h3>
            <div class="settings-card">
              <div class="settings-hint" style="margin:0 0 10px">Paste keys from <code>openrouter.ai</code> / <code>console.groq.com</code> / <code>elevenlabs.io</code>. Leave blank to clear. Stored locally only — never leaves your machine.</div>
              <div class="settings-row"><label>OpenRouter <span style="text-transform:none;font-weight:600;color:var(--muted2);letter-spacing:0">primary LLM</span>
                <span style="display:flex;gap:6px"><input type="password" placeholder="sk-or-v1-..." value="${s.openrouterApiKey||''}" data-field="openrouterApiKey" style="flex:1"><button class="btn small ghost" data-act="toggle-key" data-target="openrouterApiKey">👁</button></span></label>
                <small id="keyStatus-openrouter" style="color:var(--muted);font-size:11px"></small>
              </div>
              <div class="settings-row"><label>OpenRouter model <span style="text-transform:none;font-weight:600;color:var(--muted2);letter-spacing:0">free models — pick or type custom</span>
                <input list="or-free-models" placeholder="google/gemini-2.0-flash-001" value="${(s.openrouterModel||'').replace(/"/g,'&quot;')}" data-field="openrouterModel" style="font-family:JetBrains Mono,monospace;font-size:12px">
                <datalist id="or-free-models">${FREE_MODELS.map(m=>`<option value="${m.id}">${m.label}</option>`).join('')}</datalist>
              </label>
                <small id="keyStatus-model" style="color:var(--muted);font-size:11px"></small>
                <div class="settings-hint" style="margin:6px 0 0">Free suffix = no charge on OpenRouter. See <a href="https://openrouter.ai/models?max_price=0" target="_blank" style="color:var(--accent-2)">openrouter.ai/models?max_price=0</a> for the full list. Any model id can be typed.</div>
              </div>
              <div class="settings-row"><label>Groq <span style="text-transform:none;font-weight:600;color:var(--muted2);letter-spacing:0">fallback LLM</span>
                <span style="display:flex;gap:6px"><input type="password" placeholder="gsk_..." value="${s.groqApiKey||''}" data-field="groqApiKey" style="flex:1"><button class="btn small ghost" data-act="toggle-key" data-target="groqApiKey">👁</button></span></label>
                <small id="keyStatus-groq" style="color:var(--muted);font-size:11px"></small>
              </div>
              <div class="settings-row"><label>ElevenLabs <span style="text-transform:none;font-weight:600;color:var(--muted2);letter-spacing:0">premium TTS</span>
                <span style="display:flex;gap:6px"><input type="password" placeholder="elevenlabs key..." value="${s.elevenlabsApiKey||''}" data-field="elevenlabsApiKey" style="flex:1"><button class="btn small ghost" data-act="toggle-key" data-target="elevenlabsApiKey">👁</button></span></label>
                <small id="keyStatus-elevenlabs" style="color:var(--muted);font-size:11px"></small>
              </div>
              <div class="settings-row"><label>Fish Audio <span style="text-transform:none;font-weight:600;color:var(--muted2);letter-spacing:0">alt TTS</span>
                <span style="display:flex;gap:6px"><input type="password" placeholder="fish key..." value="${s.fishApiKey||''}" data-field="fishApiKey" style="flex:1"><button class="btn small ghost" data-act="toggle-key" data-target="fishApiKey">👁</button></span></label>
                <small id="keyStatus-fish" style="color:var(--muted);font-size:11px"></small>
              </div>
              <div class="settings-actions">
                <button class="btn primary small" data-act="save-keys">💾 Save keys to backend</button>
                <button class="btn ghost small" data-act="check-keys">Check backend</button>
              </div>
              <div id="keySaveStatus" class="settings-hint" style="display:none"></div>
            </div>
          </div>

          <div class="settings-panel ${activeTab==='app'?'active':''}" data-panel="app">
            <h3>App & Display</h3>
            <div class="settings-grid">
              <div class="settings-card">
                <h4>Backend</h4>
                <dl class="settings-kv" id="setBackendKv"><dt>Loading…</dt><dd></dd></dl>
                <div class="settings-actions">
                  <button class="btn small ghost" data-act="check-health">Check health</button>
                </div>
              </div>
              <div class="settings-card">
                <h4>Display</h4>
                <dl class="settings-kv">
                  <dt>DPR</dt><dd id="setDprVal">—</dd>
                  <dt>Viewport</dt><dd id="setViewportVal">—</dd>
                  <dt>Electron</dt><dd id="setElectronVal">—</dd>
                </dl>
                <div class="settings-actions">
                  <button class="btn small ghost" data-act="reset-window">Reset window bounds</button>
                  <button class="btn small ghost" data-act="rerun-setup">↺ Re-run setup wizard</button>
                </div>
              </div>
            </div>
            <div class="settings-card" style="margin-top:10px">
              <h4>Data</h4>
              <div class="settings-actions">
                <button class="btn small ghost" data-act="export-json">Copy settings JSON</button>
                <label class="btn small ghost" style="cursor:pointer">Import JSON <input type="file" accept=".json,application/json" style="display:none" data-act="import-json-file"></label>
                <button class="btn small" style="background:rgba(255,59,92,0.14);border-color:rgba(255,59,92,0.28)" data-act="reset-all">Reset to defaults</button>
              </div>
              <div class="settings-hint">Export copies <code>waifu:settings</code> JSON. Import replaces all settings and reloads bindings. Reset wipes localStorage settings.</div>
              <div id="setImportStatus" class="settings-hint" style="display:none"></div>
            </div>
          </div>
        </div>
      </div>
    `
    bindStatic()
    fillDynamic()
    syncAppTab()
    renderSettingsBg()
  }

  function fillDynamic(){
    const s = get()
    // model grid
    const mg = root.querySelector('#setModelGrid')
    if(mg){
      const models = modelsGetter()
      if(!models.length) mg.innerHTML = `<div class="settings-hint">No models loaded yet.</div>`
      else {
        mg.innerHTML = models.map(m=>`
          <button class="model-card ${m.id===s.modelId?'active':''}" data-set-model="${m.id}">
            <div class="avatar">${m.avatar||m.id.slice(0,2).toUpperCase()}</div>
            <div class="meta"><b>${m.name}</b><span>${m.desc||''} • ${m.jp||''}</span></div>
          </button>`).join('')
        mg.querySelectorAll('[data-set-model]').forEach(el=>{
          el.addEventListener('click', ()=>{ onAction({ type:'selectModel', id: el.dataset.setModel }); syncModelActive() })
        })
      }
    }
    // outfit picker (mirrors drawer renderOutfitPicker)
    const og = root.querySelector('#setOutfitGrid')
    if(og){
      const models = modelsGetter()
      const m = models.find(x=>x.id===s.modelId)
      const hasReal = !!(m && Array.isArray(m.outfits) && m.outfits.length)
      const outfits = hasReal ? m.outfits : [{ id:'default', name:'Default' }]
      if(!hasReal){
        og.innerHTML = ''
        og.style.display = 'none'
      } else {
        og.style.display = ''
        const cur = s.outfitId || 'default'
        og.innerHTML = `<div class="outfit-label">Outfit</div><div class="outfit-grid">${outfits.map(o=>`<button class="outfit-btn ${o.id===cur?'active':''}" data-set-outfit="${o.id}">${o.name}</button>`).join('')}</div>`
        og.querySelectorAll('[data-set-outfit]').forEach(el=>{
          el.addEventListener('click', ()=>{
            const id = el.dataset.setOutfit
            onAction({ type:'selectOutfit', id })
            // selectOutfit will set the store; sync after tick
            setTimeout(syncOutfitActive, 50)
          })
        })
      }
    }
    // anim list mini
    const al = root.querySelector('#setAnimList')
    if(al){
      const anims = animsGetter()
      if(!anims.length) al.innerHTML = `<div class="settings-hint" style="margin:0">No VMDs in folder.</div>`
      else {
        al.innerHTML = anims.map(a=>`
          <button class="anim-btn ${a.id===s.animId?'active':''}" data-set-anim="${a.id}">
            <span>${a.name}</span><small>${a.desc||''}</small>
          </button>`).join('')
        al.querySelectorAll('[data-set-anim]').forEach(el=>{
          el.addEventListener('click', ()=>{ onAction({ type:'selectAnim', id: el.dataset.setAnim }); setTimeout(syncAnimActive, 50) })
        })
      }
    }
  }

  function syncModelActive(){
    const s = get()
    root.querySelectorAll('[data-set-model]').forEach(el=> el.classList.toggle('active', el.dataset.setModel===s.modelId))
  }
  function syncOutfitActive(){
    const s = get()
    root.querySelectorAll('[data-set-outfit]').forEach(el=> el.classList.toggle('active', el.dataset.setOutfit===s.outfitId))
  }
  function syncAnimActive(){
    const s = get()
    root.querySelectorAll('[data-set-anim]').forEach(el=> el.classList.toggle('active', el.dataset.setAnim===s.animId))
  }

  async function syncAppTab(){
    const kv = root.querySelector('#setBackendKv')
    if(kv && activeTab==='app'){
      try{
        const [h, c] = await Promise.all([
          fetch('/health').then(r=>r.json()).catch(()=>null),
          fetch('/api/config').then(r=>r.json()).catch(()=>null),
        ])
        kv.innerHTML = `
          <dt>/health</dt><dd>${h ? `${h.ok?'ok':'—'} • ${h.llm_provider||''}/${h.tts_provider||''} • has_keys o:${!!h.has_openrouter} g:${!!h.has_groq} e:${!!h.has_elevenlabs}` : 'unreachable'}${h?.openrouter_model ? ` • <code style="font-size:11px">${h.openrouter_model}</code>` : ''}</dd>
          <dt>/api/config</dt><dd>${c ? JSON.stringify(c) : '—'}</dd>
          <dt>WS</dt><dd>${location.protocol}//${location.hostname}:8000/ws/talk</dd>
        `
      }catch{
        kv.innerHTML = `<dt>Backend</dt><dd>fetch failed</dd>`
      }
    }
    const dprEl = root.querySelector('#setDprVal')
    if(dprEl) dprEl.textContent = `${(window.devicePixelRatio||1).toFixed(2)} (cap: ${get().dprCap})`
    const vpEl = root.querySelector('#setViewportVal')
    if(vpEl) vpEl.textContent = `${innerWidth}×${innerHeight}`
    const eEl = root.querySelector('#setElectronVal')
    if(eEl) eEl.textContent = window.waifuDesktop?.isDesktop ? 'Electron — window-bounds.json in userData' : 'Browser — no Electron bridge'
    if(activeTab==='keys') syncKeysTab()
  }

  async function syncKeysTab(){
    try{
      const r = await fetch('/api/keys').then(x=>x.json()).catch(()=>null)
      if(!r) return
      const m=(id, masked, has)=>{ const el=document.getElementById(id); if(el) el.textContent = has ? `backend: ${masked||'set'} ✓` : 'backend: not set' }
      m('keyStatus-openrouter', r.openrouter_masked, r.has_openrouter)
      m('keyStatus-groq', r.groq_masked, r.has_groq)
      m('keyStatus-elevenlabs', r.elevenlabs_masked, r.has_elevenlabs)
      m('keyStatus-fish', r.fish_masked, r.has_fish)
      const me=document.getElementById('keyStatus-model')
      if(me) me.textContent = r.openrouter_model ? `backend model: ${r.openrouter_model}` : ''
    }catch{}
  }
  // Background picker for Graphics tab — same data as the drawer panel
  let _bgCache = null
  let _bgFetching = false
  async function renderSettingsBg(){
    const grid = root.querySelector('#setBgGrid')
    if(!grid) return
    const cur = get().backgroundId || 'gradient'
    if(!_bgCache && !_bgFetching){
      _bgFetching = true
      grid.innerHTML = `<div class="settings-hint" style="margin:0">Loading backgrounds…</div>`
      try{ _bgCache = await fetchBgList() }catch{ _bgCache = [] }
      _bgFetching = false
    }
    const list = _bgCache || []
    const builtIns = [
      { id:'gradient', name:'Gradient', type:'gradient' },
      { id:'solid', name:'Solid dark', type:'solid' },
    ]
    const all = [...builtIns, ...list]
    grid.innerHTML = all.map(b=>{
      const isActive = b.id===cur
      if(b.id==='gradient' || b.id==='solid'){
        const swatch = b.id==='gradient' ? 'background:#0f172a' : 'background:#020617'
        return `<button class="settings-bg-card ${isActive?'active':''}" data-set-bg="${b.id}" title="${b.name}" style="flex-direction:column"><div style="flex:1;${swatch};border-radius:8px 8px 0 0"></div><span>${b.name}</span></button>`
      }
      const isModel = b.type==='model'
      const safeName = (b.name||b.id).replace(/</g,'&lt;')
      const badge = isModel ? `<i style="position:absolute;top:6px;right:6px;font-size:9px;font-style:normal;font-weight:800;letter-spacing:0.06em;padding:2px 6px;border-radius:999px;background:#0ea5e9;color:#fff">3D</i>` : ''
      if(isModel){
        return `<button class="settings-bg-card ${isActive?'active':''}" data-set-bg="${b.id}" title="${safeName} — ${b.ext||'.fbx'} 3D room"><div style="flex:1;display:grid;place-items:center;background:#1e293b;font-size:22px;border-radius:8px 8px 0 0">🏠</div><span>${safeName}</span>${badge}</button>`
      }
      const url = b.file || `/backgrounds/${encodeURIComponent(b.id).replace(/%2F/g,'/')}`
      return `<button class="settings-bg-card ${isActive?'active':''}" data-set-bg="${b.id}" title="${safeName}"><img src="${url}" alt="${safeName}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'"><span style="display:none;flex:1;place-items:center;background:#1e293b">🖼</span><span>${safeName}</span></button>`
    }).join('')
    grid.querySelectorAll('[data-set-bg]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.setBg
        set({ backgroundId: id })
        onAction({ type:'field', field:'backgroundId', value:id })
        // re-render to flip active state (store onChange will also fire, but repaint now for snappy)
        renderSettingsBg()
      })
    })
  }
  let _keysSaveTimer = null
  function debouncedSaveKeys(){
    clearTimeout(_keysSaveTimer)
    _keysSaveTimer = setTimeout(()=> saveKeysToBackend(), 700)
  }
  async function saveKeysToBackend(){
    const s=get()
    const payload = {
      openrouter_api_key: s.openrouterApiKey || '',
      groq_api_key: s.groqApiKey || '',
      elevenlabs_api_key: s.elevenlabsApiKey || '',
      fish_api_key: s.fishApiKey || '',
      openrouter_model: s.openrouterModel || '',
    }
    const st = document.getElementById('keySaveStatus')
    if(st){ st.style.display='block'; st.textContent='Saving…' }
    try{
      const r = await fetch('/api/keys', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
      const j = await r.json()
      if(j.ok){
        if(st) st.textContent='Saved ✓ — backend updated (no restart needed)'
        onAction({type:'toast', text:'Keys saved ♡'})
        syncKeysTab()
        // also refresh health
        syncAppTab()
      } else {
        if(st) st.textContent='Save failed: '+(j.error||'unknown')
      }
    }catch(e){
      if(st) st.textContent='Save failed: '+e.message+' — keys still in localStorage (backend offline?)'
    }
    if(st) setTimeout(()=> st.style.display='none', 3200)
  }

  function bindStatic(){
    root.querySelectorAll('[data-tab]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        activeTab = btn.dataset.tab
        root.querySelectorAll('.settings-tab').forEach(b=>{
          const on = b.dataset.tab===activeTab
          b.classList.toggle('active', on)
          b.setAttribute('aria-selected', on ? 'true':'false')
        })
        root.querySelectorAll('.settings-panel').forEach(p=>{
          p.classList.toggle('active', p.dataset.panel===activeTab)
        })
        if(activeTab==='characters' || activeTab==='animation') fillDynamic()
        if(activeTab==='app') syncAppTab()
        if(activeTab==='keys') syncKeysTab()
        if(activeTab==='graphics') renderSettingsBg()
      })
    })
    // keyboard nav for tabs
    const tablist = root.querySelector('.settings-tabs')
    tablist?.addEventListener('keydown', (e)=>{
      const tabs = [...root.querySelectorAll('[data-tab]')]
      const idx = tabs.findIndex(t=> t.dataset.tab===activeTab)
      if(e.key==='ArrowRight'){ e.preventDefault(); const n=(idx+1)%tabs.length; tabs[n].click(); tabs[n].focus() }
      if(e.key==='ArrowLeft'){ e.preventDefault(); const n=(idx-1+tabs.length)%tabs.length; tabs[n].click(); tabs[n].focus() }
      if(e.key==='Home'){ e.preventDefault(); tabs[0].click(); tabs[0].focus() }
      if(e.key==='End'){ e.preventDefault(); tabs[tabs.length-1].click(); tabs[tabs.length-1].focus() }
    })
    root.querySelector('.settings-backdrop')?.addEventListener('click', close)
    root.querySelector('#settingsClose')?.addEventListener('click', close)

    // fields -> store (range/checkbox/select/number/text)
    root.querySelectorAll('[data-field]').forEach(el=>{
      const field = el.dataset.field
      const isCheckbox = el.type === 'checkbox'
      const isNumber = el.type === 'number'
      const ev = (isCheckbox || el.tagName === 'SELECT') ? 'change' : 'input'
      el.addEventListener(ev, ()=>{
        let v
        if(isCheckbox) v = el.checked
        else if(isNumber) v = parseFloat(el.value)
        else if(el.type==='range') v = parseFloat(el.value)
        else v = el.value
        // special: fpsCap/number coerce
        if(field==='fpsCap') v = parseInt(el.value,10)
        const patch = { [field]: v }
        set(patch)
        // update inline bind spans
        const bind = root.querySelector(`[data-bind="${field}"]`)
        if(bind){
          if(field==='affinity') bind.textContent = Number(v).toFixed(2)
          else if(field==='speed') bind.textContent = Number(v).toFixed(2)+'×'
          else if(['keyIntensity','rimIntensity'].includes(field)) bind.textContent = Number(v).toFixed(1)
          else if(['fillIntensity','backIntensity','ambientIntensity','exposure','prosodyRate'].includes(field)) bind.textContent = Number(v).toFixed(2)
          else bind.textContent = String(v)
        }
        // notify host for live effects
        onAction({ type:'field', field, value: v })
        if(field==='modelId' || field==='animId'){
          fillDynamic()
        }
        // auto-save keys to backend (debounced) so wizard/settings typing persists even without clicking Save
        if(['openrouterApiKey','groqApiKey','elevenlabsApiKey','fishApiKey','openrouterModel'].includes(field)){
          debouncedSaveKeys()
        }
      })
    })

    // actions
    root.querySelector('[data-act="export"]')?.addEventListener('click', async ()=>{
      const j = exportJson()
      try{ await navigator.clipboard.writeText(j); onAction({type:'toast', text:'Settings copied'}) }catch{ onAction({type:'export', json:j}) }
    })
    root.querySelector('[data-act="import"]')?.addEventListener('click', async ()=>{
      const txt = prompt('Paste settings JSON:')
      if(!txt) return
      try{ importJson(txt); render(); onAction({type:'toast', text:'Imported ♡'}); onAction({type:'settingsImported'}) }catch(e){ alert('Import failed: '+e.message) }
    })
    root.querySelector('[data-act="export-json"]')?.addEventListener('click', async ()=>{
      const j = exportJson()
      try{ await navigator.clipboard.writeText(j); showImportStatus('Copied JSON ♡') }catch{ showImportStatus(j.slice(0,400)) }
    })
    const fileIn = root.querySelector('[data-act="import-json-file"]')
    fileIn?.addEventListener('change', async (e)=>{
      const f = e.target.files?.[0]; if(!f) return
      const txt = await f.text()
      try{ importJson(txt); render(); showImportStatus('Imported ♡ — applied'); onAction({type:'settingsImported'}) }catch(err){ showImportStatus('Import failed: '+err.message) }
    })
    // lighting presets — Game (ZZZ) vs Villa vs Studio
    root.querySelectorAll('[data-preset]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const p = btn.dataset.preset
        const presets = {
          game:  { keyIntensity:1.45, fillIntensity:0.68, rimIntensity:0.92, backIntensity:0.22, ambientIntensity:0.78, exposure:1.08 },
          villa: { keyIntensity:1.10, fillIntensity:0.42, rimIntensity:0.38, backIntensity:0.18, ambientIntensity:0.58, exposure:0.96 },
          studio:{ keyIntensity:1.60, fillIntensity:0.85, rimIntensity:1.10, backIntensity:0.30, ambientIntensity:0.85, exposure:1.12 },
        }
        const preset = presets[p]
        if(!preset) return
        set(preset)
        render()
        onAction({type:'toast', text:`Lighting: ${p} preset applied`})
      })
    })
    root.querySelector('[data-act="reset-all"]')?.addEventListener('click', ()=>{
      if(!confirm('Reset all settings to defaults?')) return
      reset()
      render()
      onAction({type:'settingsImported'})
      onAction({type:'toast', text:'Reset to defaults'})
    })
    root.querySelector('[data-act="wpkg-open"]')?.addEventListener('click', ()=> onAction({type:'wpkgOpen'}))
    root.querySelector('[data-act="wpkg-reload"]')?.addEventListener('click', ()=> onAction({type:'wpkgReload'}))
    root.querySelector('[data-act="play"]')?.addEventListener('click', ()=> onAction({type:'play'}))
    root.querySelector('[data-act="pause"]')?.addEventListener('click', ()=> onAction({type:'pause'}))
    root.querySelector('[data-act="reset-pose"]')?.addEventListener('click', ()=> onAction({type:'resetPose'}))
    root.querySelector('[data-act="cam-front"]')?.addEventListener('click', ()=> onAction({type:'cam', preset:'front'}))
    root.querySelector('[data-act="cam-side"]')?.addEventListener('click', ()=> onAction({type:'cam', preset:'side'}))
    root.querySelector('[data-act="cam-back"]')?.addEventListener('click', ()=> onAction({type:'cam', preset:'back'}))
    root.querySelector('[data-act="cam-top"]')?.addEventListener('click', ()=> onAction({type:'cam', preset:'top'}))
    root.querySelector('[data-act="reset-camera"]')?.addEventListener('click', ()=> onAction({type:'resetCamera'}))
    root.querySelector('[data-act="check-health"]')?.addEventListener('click', ()=> syncAppTab())
    root.querySelector('[data-act="check-keys"]')?.addEventListener('click', ()=> syncKeysTab())
    root.querySelector('[data-act="save-keys"]')?.addEventListener('click', ()=> saveKeysToBackend())
    root.querySelectorAll('[data-act="toggle-key"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const target = btn.dataset.target
        const inp = root.querySelector(`[data-field="${target}"]`)
        if(inp){ inp.type = inp.type==='password' ? 'text' : 'password'; btn.textContent = inp.type==='password' ? '👁' : '🙈' }
      })
    })
    root.querySelector('[data-act="reset-window"]')?.addEventListener('click', async ()=>{
      try{
        if(window.waifuDesktop?.resetWindowBounds){
          await window.waifuDesktop.resetWindowBounds()
          onAction({type:'toast', text:'Window bounds reset — restart may be needed'})
        } else {
          onAction({type:'toast', text:'Not in Electron — no window bounds to reset'})
        }
      }catch(e){ onAction({type:'toast', text:'Reset failed: '+e.message}) }
    })
    root.querySelector('[data-act="rerun-setup"]')?.addEventListener('click', ()=> onAction({ type:'rerunSetup' }))
  }

  function showImportStatus(msg){
    const el = root.querySelector('#setImportStatus')
    if(!el) return
    el.textContent = msg
    el.style.display = 'block'
    clearTimeout(el._t)
    el._t = setTimeout(()=> el.style.display='none', 2600)
  }

  function open(tab){
    if(tab && TABS.some(t=>t.id===tab)) activeTab = tab
    render()
    root.classList.remove('hidden')
    requestAnimationFrame(()=> root.classList.add('open'))
    // keep in sync if external changes happen while open
    if(unsub) unsub()
    unsub = onChange(()=>{ /* reflect external changes: re-render lightly */ fillDynamic(); syncAppTab() })
    document.addEventListener('keydown', onKey)
  }
  function close(){
    root.classList.remove('open')
    setTimeout(()=> root.classList.add('hidden'), 180)
    if(unsub){ unsub(); unsub=null }
    document.removeEventListener('keydown', onKey)
  }
  function onKey(e){
    if(e.key==='Escape') close()
  }
  function isOpen(){ return !root.classList.contains('hidden') }

  // initial hidden state
  root.classList.add('hidden')
  return { open, close, isOpen, getActiveTab: ()=> activeTab, root, render }
}
