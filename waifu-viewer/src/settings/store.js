/**
 * settings/store.js — single source of truth for all tunables.
 * Persists to localStorage under `waifu:settings` (JSON) with one-time
 * migration from legacy per-key storage (waifu:affinity, waifu:panelCollapsed).
 */

export const DEFAULTS = {
  version: 11,
  // i18n
  language: 'en', // 'en' | 'tr'
  // Characters
  modelId: 'ellen',
  outfitId: 'default',
  affinity: 0.5,
  // API keys (local only, persisted to backend via POST /api/keys as well)
  openrouterApiKey: '',
  groqApiKey: '',
  elevenlabsApiKey: '',
  fishApiKey: '',
  openrouterModel: 'poolside/laguna-s-2.1:free',
  onboarded: false,
  // Animation — FBX-derived idle; 'none' is static T-pose fallback
  animId: 'default_pose',
  speed: 1,
  loop: true,
  mirror: false,
  // Physics & motion
  physics: true,
  ik: true,
  gravity: -18,
  eyeTracking: true,
  hitboxing: true,
  // Graphics — game-like (ZZZ/Genshin high-key anime: bright fill, strong rim, even ambient)
  keyIntensity: 1.45,
  fillIntensity: 0.68,
  rimIntensity: 0.92,
  backIntensity: 0.22,
  ambientIntensity: 0.78,
  exposure: 1.08,
  shadows: true,
  ground: true,
  dprCap: 'auto',          // 'auto' | '1.25' | '1.5' | '1.75' | '2'
  shadowRes: 'auto',        // 'auto' | '1024' | '2048'
  fpsCap: 0,                // 0 = uncapped (~90), 30/60
  // Camera — baked freecam is 38° for Cozy-Living-Room
  fov: 38,
  autoRotate: false,
  dampingFactor: 0.065,
  minDistance: 4,
  maxDistance: 50,
  maxPolarAngle: Math.PI * 0.495,
  minPolarAngle: 0.08,
  // Audio / voice
  ttsVoiceEn: 'af_sky',
  ttsVoiceJa: 'jf_alpha',
  premium: false,
  sttLang: 'auto',          // 'auto' | 'en-US' | 'ja-JP'
  bargeIn: true,
  prosodyRate: 1,
  prosodyPitch: 0,
  // App / display
  panelCollapsed: true,
  theme: 'dark',            // reserved
  // Backgrounds — 'gradient' | 'solid' | folder id from /backgrounds/ (e.g. Cozy-Living-Room)
  backgroundId: 'Cozy-Living-Room',
  backgroundBlur: 0,
}

const STORAGE_KEY = 'waifu:settings'
const FILE_ENDPOINT = '/api/settings'
let _fileSaveTimer = null

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)) }
function sanitize(raw){
  if(!raw || typeof raw !== 'object') return null
  const o = {}
  // version
  o.version = Number(raw.version) || DEFAULTS.version
  // i18n
  o.language = ['en','tr'].includes(raw.language) ? raw.language : DEFAULTS.language
  // characters
  o.modelId = ['ellen','jane','zhu'].includes(raw.modelId) ? raw.modelId : DEFAULTS.modelId
  o.outfitId = (typeof raw.outfitId === 'string' && /^[a-z0-9_-]{1,32}$/.test(raw.outfitId)) ? raw.outfitId : DEFAULTS.outfitId
  o.affinity = clamp(parseFloat(raw.affinity ?? DEFAULTS.affinity), 0, 1)
  // anim — keep 'none' or any string, default is default_pose (FBX idle)
  o.animId = typeof raw.animId === 'string' && raw.animId ? raw.animId : DEFAULTS.animId
  o.speed = clamp(parseFloat(raw.speed ?? DEFAULTS.speed), 0.1, 2)
  o.loop = !!raw.loop
  if (raw.loop === undefined) o.loop = DEFAULTS.loop
  o.mirror = !!raw.mirror
  // physics
  if (raw.physics === undefined) o.physics = DEFAULTS.physics; else o.physics = !!raw.physics
  if (raw.ik === undefined) o.ik = DEFAULTS.ik; else o.ik = !!raw.ik
  o.gravity = clamp(parseFloat(raw.gravity ?? DEFAULTS.gravity), -40, 0)
  o.eyeTracking = raw.eyeTracking !== false
  o.hitboxing = raw.hitboxing !== false
  // graphics
  o.keyIntensity = clamp(parseFloat(raw.keyIntensity ?? DEFAULTS.keyIntensity), 0, 5)
  o.fillIntensity = clamp(parseFloat(raw.fillIntensity ?? DEFAULTS.fillIntensity), 0, 2)
  o.rimIntensity = clamp(parseFloat(raw.rimIntensity ?? DEFAULTS.rimIntensity), 0, 3)
  o.backIntensity = clamp(parseFloat(raw.backIntensity ?? DEFAULTS.backIntensity), 0, 2)
  o.ambientIntensity = clamp(parseFloat(raw.ambientIntensity ?? DEFAULTS.ambientIntensity), 0, 1.5)
  o.exposure = clamp(parseFloat(raw.exposure ?? DEFAULTS.exposure), 0.3, 2)
  o.shadows = raw.shadows !== false
  o.ground = raw.ground !== false
  o.dprCap = ['auto','1.25','1.5','1.75','2'].includes(String(raw.dprCap)) ? String(raw.dprCap) : DEFAULTS.dprCap
  o.shadowRes = ['auto','1024','2048'].includes(String(raw.shadowRes)) ? String(raw.shadowRes) : DEFAULTS.shadowRes
  o.fpsCap = [0,30,60].includes(Number(raw.fpsCap)) ? Number(raw.fpsCap) : DEFAULTS.fpsCap
  // camera
  o.fov = clamp(parseFloat(raw.fov ?? DEFAULTS.fov), 20, 75)
  o.autoRotate = !!raw.autoRotate
  o.dampingFactor = clamp(parseFloat(raw.dampingFactor ?? DEFAULTS.dampingFactor), 0.01, 0.2)
  o.minDistance = clamp(parseFloat(raw.minDistance ?? DEFAULTS.minDistance), 1, 20)
  o.maxDistance = clamp(parseFloat(raw.maxDistance ?? DEFAULTS.maxDistance), 10, 80)
  o.maxPolarAngle = clamp(parseFloat(raw.maxPolarAngle ?? DEFAULTS.maxPolarAngle), 0.5, Math.PI)
  o.minPolarAngle = clamp(parseFloat(raw.minPolarAngle ?? DEFAULTS.minPolarAngle), 0, 0.5)
  // audio
  o.ttsVoiceEn = typeof raw.ttsVoiceEn === 'string' && raw.ttsVoiceEn ? raw.ttsVoiceEn : DEFAULTS.ttsVoiceEn
  o.ttsVoiceJa = typeof raw.ttsVoiceJa === 'string' && raw.ttsVoiceJa ? raw.ttsVoiceJa : DEFAULTS.ttsVoiceJa
  o.premium = !!raw.premium
  o.sttLang = ['auto','en-US','ja-JP'].includes(raw.sttLang) ? raw.sttLang : DEFAULTS.sttLang
  o.bargeIn = raw.bargeIn !== false
  o.prosodyRate = clamp(parseFloat(raw.prosodyRate ?? DEFAULTS.prosodyRate), 0.7, 1.4)
  o.prosodyPitch = clamp(parseFloat(raw.prosodyPitch ?? DEFAULTS.prosodyPitch), -6, 6)
  // api keys (free-form strings, may be empty)
  o.openrouterApiKey = typeof raw.openrouterApiKey === 'string' ? raw.openrouterApiKey.trim() : ''
  o.groqApiKey = typeof raw.groqApiKey === 'string' ? raw.groqApiKey.trim() : ''
  o.elevenlabsApiKey = typeof raw.elevenlabsApiKey === 'string' ? raw.elevenlabsApiKey.trim() : ''
  o.fishApiKey = typeof raw.fishApiKey === 'string' ? raw.fishApiKey.trim() : ''
  o.openrouterModel = typeof raw.openrouterModel === 'string' && raw.openrouterModel.trim() ? raw.openrouterModel.trim() : DEFAULTS.openrouterModel
  o.onboarded = !!raw.onboarded
  // app
  o.panelCollapsed = raw.panelCollapsed !== false
  if (typeof raw.panelCollapsed === 'boolean') o.panelCollapsed = raw.panelCollapsed
  o.theme = typeof raw.theme === 'string' ? raw.theme : DEFAULTS.theme
  // backgrounds
  o.backgroundId = typeof raw.backgroundId === 'string' && raw.backgroundId ? raw.backgroundId : DEFAULTS.backgroundId
  o.backgroundBlur = clamp(parseFloat(raw.backgroundBlur ?? DEFAULTS.backgroundBlur), 0, 20)
  return o
}

const listeners = new Set()

let _cache = null

function readLegacy(){
  const out = {}
  try{ const v = localStorage.getItem('waifu:affinity'); if(v!=null) out.affinity = parseFloat(v) }catch{}
  try{ const v = localStorage.getItem('waifu:panelCollapsed'); if(v!=null) out.panelCollapsed = v !== '0' }catch{}
  return out
}

export function load(){
  if(_cache) return _cache
  let raw = null
  try{ const s = localStorage.getItem(STORAGE_KEY); if(s) raw = JSON.parse(s) }catch{}
  if(!raw){
    const legacy = readLegacy()
    raw = { ...DEFAULTS, ...legacy, version: DEFAULTS.version }
  }
  const clean = sanitize(raw) || { ...DEFAULTS }
  // migrate v5 → v6: cozy lighting + baked freecam 38°
  if((clean.version||0) < 6){
    const wasV5 = clean.version===5
    // only auto-fix if user was still on old defaults (don't overwrite custom tweaks much)
    const near = (a,b)=> Math.abs(a-b) < 0.06
    if(wasV5 && near(clean.keyIntensity,2.8) && near(clean.fillIntensity,0.6) && near(clean.rimIntensity,1.2)){
      clean.keyIntensity = DEFAULTS.keyIntensity
      clean.fillIntensity = DEFAULTS.fillIntensity
      clean.rimIntensity = DEFAULTS.rimIntensity
      clean.backIntensity = DEFAULTS.backIntensity
      clean.ambientIntensity = DEFAULTS.ambientIntensity
      clean.exposure = DEFAULTS.exposure
    }
    if(wasV5 && clean.fov===36) clean.fov = DEFAULTS.fov
    clean.version = 6
  }
  // migrate v6 → v7: outfits support
  if ((clean.version||0) < 7) {
    if (!clean.outfitId || typeof clean.outfitId !== 'string') clean.outfitId = DEFAULTS.outfitId;
    clean.version = 7
  }
  // migrate v7 → v8: default animation is FBX idle (default_pose), not T-pose 'none'
  if ((clean.version||0) < 8) {
    if (!clean.animId || clean.animId === 'none') clean.animId = DEFAULTS.animId;
    clean.version = 8
  }
  // migrate v8 → v9: cozy villa lighting (fix sandbox/GMod flat)
  if ((clean.version||0) < 9) {
    const near = (a,b)=> Math.abs(a-b) < 0.08
    if (near(clean.keyIntensity,1.75) && near(clean.fillIntensity,0.68) && near(clean.rimIntensity,0.92)) {
      clean.keyIntensity = DEFAULTS.keyIntensity
      clean.fillIntensity = DEFAULTS.fillIntensity
      clean.rimIntensity = DEFAULTS.rimIntensity
      clean.backIntensity = DEFAULTS.backIntensity
      clean.ambientIntensity = DEFAULTS.ambientIntensity
      clean.exposure = DEFAULTS.exposure
    }
    clean.version = 9
  }
  // migrate v9 → v10: game-like high-key anime (ZZZ/Genshin)
  if ((clean.version||0) < 10) {
    const near = (a,b)=> Math.abs(a-b) < 0.09
    // if user was on villa defaults (1.10/0.42/0.38/0.18/0.58/0.96) → auto-upgrade to game
    if (near(clean.keyIntensity,1.10) && near(clean.fillIntensity,0.42) && near(clean.rimIntensity,0.38)) {
      clean.keyIntensity = DEFAULTS.keyIntensity
      clean.fillIntensity = DEFAULTS.fillIntensity
      clean.rimIntensity = DEFAULTS.rimIntensity
      clean.backIntensity = DEFAULTS.backIntensity
      clean.ambientIntensity = DEFAULTS.ambientIntensity
      clean.exposure = DEFAULTS.exposure
    }
    clean.version = 10
  }
  // migrate v10 → v11: add language
  if ((clean.version||0) < 11) {
    if(!['en','tr'].includes(clean.language)) clean.language = DEFAULTS.language
    clean.version = DEFAULTS.version
  }
  _cache = clean
  // write back once to seal migration / defaults
  save()
  // hydrate from file (best-effort, merges file over local when available)
  // delay to let backend be reachable; do not block return
  setTimeout(()=> { loadFromFile().catch(()=>{}) }, 300)
  return _cache
}

export function save(){
  if(!_cache) return
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache)) }catch{}
  // keep legacy affinity mirror for older code paths that read it directly
  try{ localStorage.setItem('waifu:affinity', String(_cache.affinity)) }catch{}
  try{ localStorage.setItem('waifu:panelCollapsed', _cache.panelCollapsed ? '1' : '0') }catch{}
  debouncedSaveToFile()
}

function saveToFile(){
  if(!_cache) return
  // fire-and-forget; backend sanitizes and persists to user_settings.json
  try{
    fetch(FILE_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(_cache),
    }).catch(()=>{})
  }catch{}
}
function debouncedSaveToFile(){
  clearTimeout(_fileSaveTimer)
  _fileSaveTimer = setTimeout(()=> saveToFile(), 500)
}
export async function loadFromFile(){
  try{
    const r = await fetch(FILE_ENDPOINT)
    if(!r.ok) return null
    const j = await r.json()
    if(!j?.ok || !j.settings) return null
    const fileS = j.settings
    const patch = { ...fileS }
    // never regress onboarded: if local already onboarded, keep it
    if(_cache?.onboarded && !patch.onboarded) delete patch.onboarded
    // keep local keys if file lacks them
    if(!patch.openrouterModel && _cache?.openrouterModel) delete patch.openrouterModel
    if(!patch.backgroundId && _cache?.backgroundId) delete patch.backgroundId
    set(patch)
    return get()
  }catch{ return null }
}
export function saveToFileNow(){ saveToFile() }

export function get(){ if(!_cache) load(); return { ..._cache } }
export function getRaw(){ if(!_cache) load(); return _cache }

export function set(patch){
  if(!_cache) load()
  const next = sanitize({ ..._cache, ...patch })
  const changed = {}
  for(const k of Object.keys(next)){
    if(next[k] !== _cache[k]) changed[k] = next[k]
  }
  if(!Object.keys(changed).length) return get()
  _cache = next
  save()
  for(const cb of listeners) try{ cb(get(), changed) }catch{}
  return get()
}

export function reset(keys){
  if(!_cache) load()
  if(!keys){
    _cache = { ...DEFAULTS }
    save()
    for(const cb of listeners) try{ cb(get(), { ...DEFAULTS }) }catch{}
    return get()
  }
  const patch = {}
  for(const k of keys) patch[k] = DEFAULTS[k]
  return set(patch)
}

export function onChange(cb){
  listeners.add(cb)
  return ()=> listeners.delete(cb)
}

export function isOnboarded(){ if(!_cache) load(); return !!_cache.onboarded }
export function setOnboarded(v=true){
  const out = set({ onboarded: !!v })
  // bypass debounce so dismissal persists even if tab closes immediately
  try{ saveToFileNow() }catch{}
  return out
}
export function exportJson(){ if(!_cache) load(); return JSON.stringify(_cache, null, 2) }
export function importJson(json){
  let obj
  try{ obj = typeof json === 'string' ? JSON.parse(json) : json }catch(e){ throw new Error('Invalid JSON: ' + e.message) }
  const clean = sanitize(obj)
  if(!clean) throw new Error('Invalid settings shape')
  clean.version = DEFAULTS.version
  _cache = clean
  save()
  for(const cb of listeners) try{ cb(get(), { ...clean }) }catch{}
  return get()
}

// legacy helpers so existing code can keep using affinity object if desired
export const affinityCompat = {
  get(){ return getRaw().affinity },
  set(v){ set({ affinity: v }) },
  bump(d){ const n = clamp(getRaw().affinity + d, 0, 1); set({ affinity: n }); return n },
  nudgeFromText(t){
    const low = String(t||'').toLowerCase()
    if(/(thank|love|great|awesome|かわいい|ありがとう)/.test(low)) return affinityCompat.bump(0.02)
    if(/(hate|bad|annoying|うざい)/.test(low)) return affinityCompat.bump(-0.03)
    return affinityCompat.get()
  },
}
