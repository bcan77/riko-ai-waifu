import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MMDLoader } from 'three/examples/jsm/loaders/MMDLoader.js'
import { MMDAnimationHelper } from 'three/examples/jsm/animation/MMDAnimationHelper.js'
import { WaifuClient } from './services/waifu-client.js'
import { createMorphDriver } from './services/morph-driver.js'
import { mountWpkgEditor } from './editor/WpkgEditor.js'
import './editor/editor.css'
import './settings/settings.css'
import { load as loadSettings, get as getSettings, getRaw as getSettingsRaw, set as setSettings, onChange as onSettingsChange, DEFAULTS as SETTINGS_DEFAULTS, isOnboarded, setOnboarded } from './settings/store.js'
import { mountSettingsModal } from './settings/SettingsModal.js'
import { mountSetupWizard } from './settings/SetupWizard.js'
import { registerBackgroundSphere, registerBackgroundGroup, registerGround, registerCamera, applyBackground, fetchBackgrounds, setBackground, getCamDebug, setCamDebugTransform, resetCamDebug, getCamLive, getBgDebug, setBgDebugTransform, resetBgDebug, getBgLiveTransform } from './services/background-manager.js'
import { initVersionManager } from './services/version-manager.js'

// ---- Affinity / tools ----
import { setupHitboxing, setupEyeTracking, hotSwapVmd, applyProsody } from './services/tools.js'
import { affinityCompat as affinity } from './settings/store.js'

// ---- Helpers ----
const $ = s => document.querySelector(s)
const toast = (msg, ms=2400) => {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(t._id)
  t._id = setTimeout(()=>t.classList.remove('show'), ms)
}
const setStatus = (txt, cls='') => {
  const el = $('#status')
  if(!el) return
  el.className = 'status ' + cls
  el.title = txt
  // wrap in span so flex + ellipsis truncates correctly
  el.textContent = ''
  const sp = document.createElement('span')
  sp.textContent = txt
  el.appendChild(sp)
}
const LOADER_STAGES = ['Bullet','Model','Physics','VMD','Ready']
let loaderStage = 0
const setLoader = (show, title, pct, sub) => {
  const l = $('#loader')
  if(!show){ l.classList.add('hidden'); return }
  l.classList.remove('hidden')
  if(title) $('#loaderTitle').textContent = title
  if(pct!=null) $('#loaderBar').style.width = pct + '%'
  if(sub) $('#loaderSub').textContent = sub
}
const setLoaderStage = (idx, title, pct, sub) => {
  loaderStage = idx
  setLoader(true, title, pct, sub)
  const dots = document.querySelectorAll('.loader-steps .step')
  dots.forEach((el,i)=>{ el.classList.toggle('active', i===idx); el.classList.toggle('done', i<idx) })
  const pctEl = document.getElementById('loaderPct')
  if(pctEl && pct!=null) pctEl.textContent = Math.round(pct)+'%'
  // secondary bar
  const subBar = document.getElementById('loaderSubBar')
  if(subBar && pct!=null) subBar.style.width = pct + '%'
}
const bumpLoader = (title, pct, sub) => setLoaderStage(loaderStage, title||LOADER_STAGES[loaderStage]||'', pct, sub)

// ---- Data ----
const MODELS = [
  { id:'ellen', name:'Ellen Joe', jp:'艾莲', file:'/models/Ellen Joe/艾莲.pmx', avatar:'EJ', desc:'Shark maid • Ellen',
    outfits:[
      { id:'default',   name:'Maid',      file:'/models/Ellen Joe/艾莲.pmx' },
      { id:'on_campus', name:'On Campus', file:'/models/Ellen Joe - On Campus/艾莲.pmx' },
    ] },
  { id:'jane',  name:'Jane Doe',  jp:'简',   file:'/models/Jane Doe/简.pmx',      avatar:'JD', desc:'Rat thiren • Jane' },
  { id:'zhu',   name:'Zhu Yuan', jp:'朱鸢', file:'/models/Zhu Yuan/朱鸢.pmx',    avatar:'ZY', desc:'Crisis squad • Zhu Yuan' },
]

function getModelById(id){ return MODELS.find(m=>m.id===id) || null }
function getOutfitsForModel(modelId){
  const m = getModelById(modelId)
  if(!m) return []
  if(Array.isArray(m.outfits) && m.outfits.length) return m.outfits
  return [{ id:'default', name:'Default', file:m.file }]
}
function resolveModelFile(modelId, outfitId){
  const outfits = getOutfitsForModel(modelId)
  const hit = outfits.find(o=>o.id===outfitId)
  if(hit) return hit.file
  const m = getModelById(modelId)
  return hit?.file || outfits[0]?.file || m?.file || ''
}
function currentOutfitId(){
  try { return getSettingsRaw().outfitId || 'default' } catch { return 'default' }
}

// VMD animations — live-synced with VMD_Animations folder via /api/vmd
let ANIMATIONS = [
  { id:'none', name:'No animation', file:null, desc:'Static pose' },
]

async function fetchVmdList(){
  try{
    const r = await fetch('/api/vmd', { cache:'no-store' })
    if(!r.ok) throw new Error('api ' + r.status)
    const list = await r.json()
    // dedup ids
    const seen = new Set(['none'])
    const mapped = []
    for(const e of list){
      let id = (e.id || e.raw || e.name || 'vmd').toString().replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'').toLowerCase() || 'vmd'
      let base = id, k=2
      while(seen.has(id)){ id = `${base}_${k++}` }
      seen.add(id)
      mapped.push({ id, name: e.name || e.raw, file: e.file, desc: e.desc || '' })
    }
    ANIMATIONS = [{ id:'none', name:'No animation', file:null, desc:'Static pose' }, ...mapped]
    return true
  }catch(err){
    // fallback for prod/dist where /api/vmd is not served but static /vmd/* exists (vite build serves from public/vmd)
    // probe known defaults so default_pose isn't invisible in production.
    try{
      const probes = ['default_pose.vmd', '1.vmd', 'Hip Hop Dancing.vmd']
      const found = []
      for(const fname of probes){
        try{
          const pr = await fetch(`/vmd/${encodeURIComponent(fname)}`, { method:'HEAD', cache:'no-store' })
          if(pr.ok){
            const id = fname.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'').toLowerCase()
            found.push({ id, name: fname.replace(/\.vmd$/i,''), file:`/vmd/${encodeURIComponent(fname)}`, desc:'static' })
          }
        }catch{}
      }
      if(found.length){
        // dedup against 'none'
        const seen2 = new Set(['none'])
        const mapped2 = []
        for(const e of found){
          let id=e.id, base=id, k=2
          while(seen2.has(id)) id=`${base}_${k++}`
          seen2.add(id); mapped2.push(e)
        }
        ANIMATIONS = [{ id:'none', name:'No animation', file:null, desc:'Static pose' }, ...mapped2]
        return true
      }
    }catch{}
    return false
  }
}

function buildAnimList(){
  const al = $('#animList')
  if(!al) return
  if(ANIMATIONS.length === 1){
    al.innerHTML = `
      <div class="hint" style="padding:8px 2px">
        No VMD files found in <code>VMD_Animations/</code>. Drop a <code>.vmd</code> in that folder — the list updates live.
      </div>
      <button class="anim-btn active" data-id="none"><span>No animation</span><small>Static pose</small></button>
    `
  } else {
    al.innerHTML = ANIMATIONS.map(a=>`
      <button class="anim-btn ${a.id===params.animId?'active':''}" data-id="${a.id}">
        <span>${a.name}</span><small>${a.desc}</small>
      </button>
    `).join('')
  }
  al.querySelectorAll('.anim-btn').forEach(el=>{
    el.addEventListener('click', ()=> selectAnimation(el.dataset.id))
  })
  const countEl = document.getElementById('vmdCount')
  if(countEl) countEl.textContent = `${Math.max(0, ANIMATIONS.length-1)} VMD`
}

// ---- Scene ────────────────────────────────────────────────────
const canvas = $('#canvas')
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
try{ if(navigator.deviceMemory && navigator.deviceMemory < 4) renderer.shadowMap.enabled = false }catch{}

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0c0d13)

const camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, 0.1, 500)
camera.position.set(-47.625, 18.212, 12.266)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(-20.48, 15.605, 5.917)
controls.enableDamping = true
controls.dampingFactor = 0.065
controls.minDistance = 3
controls.maxDistance = 70
controls.maxPolarAngle = Math.PI * 0.49
controls.minPolarAngle = 0.05
registerCamera(camera, controls)

// ── WASD Freecam ─────────────────────────────────────────────
let freecamEnabled = (()=>{ try{ return localStorage.getItem('waifu:freecamEnabled')==='1' }catch{ return false }})()
let freecamSpeed = parseFloat((()=>{ try{ return localStorage.getItem('waifu:freecamSpeed')||'6' }catch{return '6'}})()) || 6
const freecamKeys = { w:false,a:false,s:false,d:false,q:false,e:false,shift:false,ctrl:false,space:false }
function isTyping(){ const ae=document.activeElement; if(!ae) return false; const tag=(ae.tagName||'').toLowerCase(); return tag==='input'||tag==='textarea'||tag==='select'||ae.isContentEditable||ae.id==='chatInput' }
function setFreecamEnabled(v){
  freecamEnabled=!!v
  try{ localStorage.setItem('waifu:freecamEnabled', freecamEnabled?'1':'0') }catch{}
  if(freecamEnabled) toast('Freecam ON — WASD move, Q/E up/down, Shift sprint, Ctrl slow, drag to look', 3000)
  else toast('Freecam OFF', 1400)
  const btn=document.getElementById('btnBgDebug')
  if(btn) btn.style.outline = freecamEnabled ? '2px solid #0ea5e9' : ''
  const chk=document.getElementById('chkFreecam')
  if(chk) chk.checked=freecamEnabled
  if(freecamEnabled){
    try{
      setCamDebugTransform({
        pos:{ x:+camera.position.x.toFixed(2), y:+camera.position.y.toFixed(2), z:+camera.position.z.toFixed(2) },
        target:{ x:+controls.target.x.toFixed(2), y:+controls.target.y.toFixed(2), z:+controls.target.z.toFixed(2) }
      })
    }catch{}
  }
}
addEventListener('keydown', (e)=>{
  const k=e.key.toLowerCase()
  if(k==='w') freecamKeys.w=true
  else if(k==='a') freecamKeys.a=true
  else if(k==='s') freecamKeys.s=true
  else if(k==='d') freecamKeys.d=true
  else if(k==='q') freecamKeys.q=true
  else if(k==='e') freecamKeys.e=true
  else if(k===' ') freecamKeys.space=true
  if(e.shiftKey) freecamKeys.shift=true
  if(e.ctrlKey) freecamKeys.ctrl=true
  if(freecamEnabled && !isTyping() && ['w','a','s','d','q','e',' '].includes(k)){
    if(!e.metaKey) e.preventDefault()
  }
  if(!isTyping() && k==='f' && !e.ctrlKey && !e.metaKey && !e.altKey){
    setFreecamEnabled(!freecamEnabled)
  }
  if(!isTyping() && k==='y' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey){
    try{ setModelDebugTransform({ rot:{ y:0 } }); toast('Model yaw centered') }catch{}
  }
})
addEventListener('keyup', (e)=>{
  const k=e.key.toLowerCase()
  if(k==='w') freecamKeys.w=false
  else if(k==='a') freecamKeys.a=false
  else if(k==='s') freecamKeys.s=false
  else if(k==='d') freecamKeys.d=false
  else if(k==='q') freecamKeys.q=false
  else if(k==='e') freecamKeys.e=false
  else if(k===' ') freecamKeys.space=false
  if(!e.shiftKey) freecamKeys.shift=false
  if(!e.ctrlKey) freecamKeys.ctrl=false
})
addEventListener('blur', ()=>{ Object.keys(freecamKeys).forEach(k=>freecamKeys[k]=false) })
window.freecam = { get enabled(){return freecamEnabled}, setEnabled:setFreecamEnabled, get speed(){return freecamSpeed}, setSpeed(v){ freecamSpeed=v; try{localStorage.setItem('waifu:freecamSpeed', String(v))}catch{} }, toggle:()=>setFreecamEnabled(!freecamEnabled) }

// ── MMD Model pose — editable + auto-saved (baked default pos -20,-0.35,4.7 rot 0,-74,0) ──
let _modelDbg = (()=>{ try{ const j=JSON.parse(localStorage.getItem('waifu:modelDebug')||'null'); if(j&&typeof j==='object'&&j.pos&&j.rot) return { pos:{...j.pos}, rot:{...j.rot}, scale:(typeof j.scale==='number'?j.scale:1)} }catch{} return null })() || { pos:{x:-20, y:-0.35, z:4.7}, rot:{x:0, y:-74, z:0}, scale:1 }
function _saveModelDbg(){ try{ localStorage.setItem('waifu:modelDebug', JSON.stringify(_modelDbg)) }catch{} }
function getModelDebug(){ return JSON.parse(JSON.stringify(_modelDbg)) }
function getModelLive(){
  if(!mmdMesh) return { pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0}, scale:1, dbg:{..._modelDbg} }
  const p=mmdMesh.position, r=mmdMesh.rotation
  return {
    pos:{x:+p.x.toFixed(3), y:+p.y.toFixed(3), z:+p.z.toFixed(3)},
    rot:{x:+(THREE.MathUtils.radToDeg(r.x).toFixed(1)), y:+(THREE.MathUtils.radToDeg(r.y).toFixed(1)), z:+(THREE.MathUtils.radToDeg(r.z).toFixed(1))},
    scale: +(mmdMesh.scale.y.toFixed(3)),
    dbg:{..._modelDbg}
  }
}
function _applyModelDbg(){
  if(!mmdMesh) return
  mmdMesh.position.set(_modelDbg.pos.x, _modelDbg.pos.y, _modelDbg.pos.z)
  mmdMesh.rotation.set(THREE.MathUtils.degToRad(_modelDbg.rot.x), THREE.MathUtils.degToRad(_modelDbg.rot.y), THREE.MathUtils.degToRad(_modelDbg.rot.z))
  const s = _modelDbg.scale||1
  if(params.mirror) mmdMesh.scale.set(-s, s, s)
  else mmdMesh.scale.set(s,s,s)
}
function setModelDebugTransform(patch){
  if(!patch) return
  if(patch.pos) Object.assign(_modelDbg.pos, patch.pos)
  if(patch.rot) Object.assign(_modelDbg.rot, patch.rot)
  if(typeof patch.scale==='number') _modelDbg.scale = patch.scale
  _saveModelDbg()
  _applyModelDbg()
}
function resetModelDebug(){
  _modelDbg = { pos:{x:-20, y:-0.35, z:4.7}, rot:{x:0, y:-74, z:0}, scale:1 }
  _saveModelDbg()
  _applyModelDbg()
}
window.modelDebug = { get:getModelDebug, set:setModelDebugTransform, reset:resetModelDebug, live:getModelLive, apply:_applyModelDbg }

// -- Solid background via large sphere (flat color) + image/model bg support ---
let bgSphereMesh = null
{
  const geo = new THREE.SphereGeometry(180, 32, 32)
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0f1c, side: THREE.BackSide })
  const bg = new THREE.Mesh(geo, mat)
  scene.add(bg)
  bgSphereMesh = bg
  registerBackgroundSphere(bg)
}
// 3D background model container — behind character
{
  const g = new THREE.Group()
  g.name = 'BackgroundModelGroup'
  g.visible = false
  scene.add(g)
  registerBackgroundGroup(g)
}
try{ applyBackground(getSettingsRaw().backgroundId, scene) }catch{}

// Ground — blue/black
const ground = (() => {
  const g = new THREE.CircleGeometry(38, 64)
  const m = new THREE.MeshStandardMaterial({ color:0x121a2a, roughness:0.86, metalness:0.04 })
  const mesh = new THREE.Mesh(g, m)
  mesh.rotation.x = -Math.PI/2
  mesh.position.y = 0
  mesh.receiveShadow = true
  scene.add(mesh)
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({length:64},(_,i)=> {
      const a = i/64*Math.PI*2
      return new THREE.Vector3(Math.cos(a)*38, 0.02, Math.sin(a)*38)
    })),
    new THREE.LineBasicMaterial({ color:0x1e293b, transparent:true, opacity:0.45 })
  )
  scene.add(line)

  const grid = new THREE.GridHelper(76, 38, 0x1e3a5f, 0x0f172a)
  grid.position.y = 0.02
  scene.add(grid)
  const out = { mesh, grid, line }
  registerGround(out)
  return out
})()

// Lights — game-like (ZZZ/Genshin high-key anime)
// Reference: soft studio, even fill, strong warm rim on hair, light ground bounce.
// Character and background share lights but character stays ~0.3 stops brighter.
const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffe8cc, 1.05)
hemiLight.position.set(0, 20, 0)
scene.add(hemiLight)

const keyLight = new THREE.DirectionalLight(0xfff6e8, 1.45)
keyLight.position.set(4.5, 10, 6)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048,2048)
keyLight.shadow.camera.near = 0.5
keyLight.shadow.camera.far = 70
keyLight.shadow.camera.left = -22
keyLight.shadow.camera.right = 22
keyLight.shadow.camera.top = 22
keyLight.shadow.camera.bottom = -22
keyLight.shadow.bias = -0.0008
keyLight.shadow.radius = 4
keyLight.shadow.normalBias = 0.02
scene.add(keyLight)
scene.add(keyLight.target)
keyLight.target.position.set(0, 8, 0)

const fillLight = new THREE.DirectionalLight(0xd8e8ff, 0.68)
fillLight.position.set(-5.2, 7.5, -4.2)
scene.add(fillLight)

const rimLight = new THREE.DirectionalLight(0xffdfb5, 0.92)
rimLight.position.set(-3.2, 9.2, -7.5)
scene.add(rimLight)

const backLight = new THREE.DirectionalLight(0xffe4c0, 0.22)
backLight.position.set(2.2, 6.5, -8.5)
scene.add(backLight)

// subtle interior bounce — kept very low for game look (was villa lamp 0.75)
const lampLight = new THREE.PointLight(0xffc07a, 0.22, 16, 2)
lampLight.position.set(-1.8, 5.2, 0.5)
lampLight.decay = 2
scene.add(lampLight)
// soft sky bounce from window side — also subtle
const windowBounce = new THREE.PointLight(0xe8f0ff, 0.18, 18, 2)
windowBounce.position.set(5, 8, 6)
scene.add(windowBounce)

const ambient = new THREE.AmbientLight(0xfff1e6, 0.78)
scene.add(ambient)
// dedicated face fill — always in front of the face (face-forward, not N·L)
// Genshin trick: face lighting uses head forward, not vertex normal, so face never goes dark in profile.
// We add a low, non-shadow directional that tracks the head bone.
const faceLight = new THREE.DirectionalLight(0xfff2e0, 0.55)
faceLight.position.set(0, 15.5, 18)
faceLight.target.position.set(0, 15, 0)
faceLight.castShadow = false
scene.add(faceLight)
scene.add(faceLight.target)
window.faceLight = faceLight // debug: tweak intensity in console
let headBone = null
window._getHeadBone = ()=> headBone
// helper to find head bone from skeleton
function bindHeadBone(){
  headBone = null
  try{
    const bones = mmdMesh?.skeleton?.bones || helper?.objects?.get(mmdMesh)?.skeleton?.bones || []
    headBone = bones.find(b=> {
      const n=(b.name||'').toLowerCase()
      return n==='頭' || n==='head' || n==='頭部' || n.includes('head') || n.includes('頭')
    }) || null
    if(headBone) console.log(`[face] head bone bound: ${headBone.name} idx=${bones.indexOf(headBone)}`)
    else console.log('[face] head bone not found — faceLight will stay static')
    window._headBone = headBone
  }catch(e){ console.warn('[face] bindHeadBone failed', e) }
}
renderer.toneMappingExposure = 1.08
renderer.physicallyCorrectLights = true
// game-like: slightly higher exposure, ACES stays, add subtle ambient for face
try{ hemiLight.intensity = 1.05; ambient.intensity = 0.78; }catch{}

// ---- Apply persisted settings to scene immediately
function applyInitialSettings(){
  const s = getSettingsRaw()
  keyLight.intensity = s.keyIntensity
  fillLight.intensity = s.fillIntensity
  rimLight.intensity = s.rimIntensity
  backLight.intensity = s.backIntensity
  ambient.intensity = s.ambientIntensity
  renderer.toneMappingExposure = s.exposure
  const wantShadows = s.shadows && !(navigator.deviceMemory && navigator.deviceMemory < 4 && s.shadows)
  // if deviceMemory <4 we still respect user's shadows toggle but disable if low mem and not overridden
  try{ if(navigator.deviceMemory && navigator.deviceMemory < 4) renderer.shadowMap.enabled = false
       else renderer.shadowMap.enabled = s.shadows }catch{ renderer.shadowMap.enabled = s.shadows }
  keyLight.castShadow = renderer.shadowMap.enabled
  ground.mesh.visible = s.ground; ground.grid.visible = s.ground; ground.line.visible = s.ground
  camera.fov = s.fov; camera.updateProjectionMatrix()
  controls.dampingFactor = s.dampingFactor
  controls.minDistance = s.minDistance
  controls.maxDistance = s.maxDistance
  controls.maxPolarAngle = s.maxPolarAngle
  controls.minPolarAngle = s.minPolarAngle
  // reflect slider UI if present (drawer + settings will also bind)
  const setVal = (id, v)=>{ const el=document.getElementById(id); if(el) el.textContent=v }
  // defer until DOM ready
  requestAnimationFrame(()=>{
    const s2 = getSettingsRaw()
    const q=(id,val)=>{ const e=document.getElementById(id); if(e) e.value=val }
    q('keyIntensity', s2.keyIntensity); setVal('keyVal', s2.keyIntensity.toFixed(1))
    q('fillIntensity', s2.fillIntensity); setVal('fillVal', s2.fillIntensity.toFixed(2))
    q('rimIntensity', s2.rimIntensity); setVal('rimVal', s2.rimIntensity.toFixed(1))
    q('exposure', s2.exposure); setVal('expVal', s2.exposure.toFixed(2))
    q('gravity', s2.gravity); setVal('gravVal', s2.gravity.toFixed(1))
    q('speed', s2.speed); setVal('speedVal', s2.speed.toFixed(2)+'×')
    const ch=(id,v)=>{ const e=document.getElementById(id); if(e) e.checked=!!v }
    ch('shadowChk', s2.shadows); ch('groundChk', s2.ground); ch('physicsChk', s2.physics); ch('ikChk', s2.ik)
    ch('loopChk', s2.loop); ch('mirrorChk', s2.mirror); ch('autoRotateChk', s2.autoRotate)
    ch('premiumChk', s2.premium)
  })
}
applyInitialSettings()

// ---- Settings-backed dynamic resolution
// loadSettings() called above; params is a live proxy over the store
const _storeSeed = loadSettings()

function idealDpr(){
  const dpr = window.devicePixelRatio || 1
  const s = getSettingsRaw()
  if(s.dprCap !== 'auto') return Math.min(dpr, parseFloat(s.dprCap))
  const area = innerWidth * innerHeight
  if(area < 500*700) return Math.min(dpr, 1.25)
  if(area < 1280*800) return Math.min(dpr, 1.5)
  if(area < 1920*1080) return Math.min(dpr, 1.75)
  return Math.min(dpr, 2)
}
function applyRendererSize(){
  const dpr = idealDpr()
  renderer.setPixelRatio(dpr)
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
  const s = getSettingsRaw()
  let sh
  if(s.shadowRes !== 'auto') sh = parseInt(s.shadowRes, 10)
  else sh = (w < 900 || dpr < 1.3) ? 1024 : 2048
  if(keyLight.shadow.mapSize.x !== sh){
    keyLight.shadow.mapSize.set(sh, sh)
    if(keyLight.shadow.map){ keyLight.shadow.map.dispose(); keyLight.shadow.map = null }
  }
}
// must run after scene/camera/lights are created
applyRendererSize()

// Helpers state
let ammoReady = false
let helper = null
let mmdMesh = null
let currentVmd = null
let clock = new THREE.Clock()

// params is a live facade over the settings store so legacy code keeps working
const params = {}
;['modelId','outfitId','animId','physics','ik','loop','mirror','speed','autoRotate','gravity'].forEach(k=>{
  Object.defineProperty(params, k, {
    get(){ return getSettingsRaw()[k] },
    set(v){ setSettings({ [k]: v }) },
    enumerable:true, configurable:true
  })
})

// Ammo readiness — non-blocking, yields to keep UI responsive
async function ensureAmmo(){
  if(ammoReady) return
  setLoaderStage(0, 'Bullet physics', 10, 'Loading ammo.js / WASM…')
  if(typeof Ammo === 'undefined'){
    throw new Error('Ammo not loaded. Check /ammo/ammo.js')
  }
  // yield a frame so loader actually paints
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
  const lib = await Ammo()
  window.AmmoLib = lib
  ammoReady = true
  await new Promise(r => setTimeout(r, 16)) // let paint
}

function createHelper(){
  if(helper) {
    try{ helper.remove(mmdMesh) }catch{}
  }
  helper = new MMDAnimationHelper({
    afterglow: 0.0,
    resetPhysicsOnLoop: true
  })
  helper.configuration = helper.configuration || {}
}

const loader = new MMDLoader()

function sanitizePhysics(mmdData){
  const rbs = mmdData.rigidBodies || []
  for(const rb of rbs){
    rb.restitution = Math.min(rb.restitution, 0.12)
    rb.friction = Math.max(rb.friction, 0.55)
    if(rb.type !== 0){
      if(rb.positionDamping < 0.32) rb.positionDamping = 0.38
      if(rb.rotationDamping < 0.32) rb.rotationDamping = 0.48
      if(rb.shapeType === 2 && rb.width < 0.42){
        rb.positionDamping = Math.max(rb.positionDamping, 0.62)
        rb.rotationDamping = Math.max(rb.rotationDamping, 0.72)
        rb.restitution = 0.0
        if(rb.weight > 0.6) rb.weight *= 0.92
      }
    }
  }
  const cons = mmdData.constraints || []
  for(const c of cons){
    for(let i=0;i<3;i++){
      if(c.springPosition[i] > 70) c.springPosition[i] = 42
      if(c.springRotation[i] > 70) c.springRotation[i] = 28
    }
  }
}

const PHYSICS_DEFAULTS = {
  gravity: new THREE.Vector3(0, -18, 0),
  unitStep: 1/60,
  maxStepNum: 4,
  warmup: 20,
}

function updatePhysicsGravity(v){
  if(!helper || !helper.objects) return
  const obj = helper.objects.get(mmdMesh)
  if(obj && obj.physics){
    try{
      const lib = window.AmmoLib
      if(lib && obj.physics.world){
        const gv = new lib.btVector3(0, v, 0)
        obj.physics.world.setGravity(gv)
        obj.physics.gravity.set(0, v, 0)
      }
    }catch(e){ console.warn('gravity set failed', e) }
  }
}

// UI build
function buildUI(){
  const mg = $('#modelGrid')
  mg.innerHTML = MODELS.map(m=>`
    <div class="model-card ${m.id===params.modelId?'active':''}" data-id="${m.id}">
      <div class="avatar">${m.avatar}</div>
      <div class="meta"><b>${m.name}</b><span>${m.desc} • ${m.jp}</span></div>
    </div>
  `).join('')
  mg.querySelectorAll('.model-card').forEach(el=>{
    el.addEventListener('click', ()=> selectModel(el.dataset.id))
  })
  renderOutfitPicker()
  buildAnimList()
}

function renderOutfitPicker(){
  let host = document.getElementById('outfitPicker')
  if(!host){
    const mg = document.getElementById('modelGrid')
    if(mg){
      host = document.createElement('div')
      host.id = 'outfitPicker'
      host.className = 'outfit-picker'
      mg.insertAdjacentElement('afterend', host)
    }
  }
  if(!host) return
  const outfits = getOutfitsForModel(params.modelId)
  if(!outfits.length || outfits.length===1 && outfits[0].id==='default' && !getModelById(params.modelId)?.outfits){
    host.innerHTML = ''
    host.style.display = 'none'
    return
  }
  host.style.display = ''
  const cur = currentOutfitId()
  host.innerHTML = `
    <div class="outfit-label">Outfit</div>
    <div class="outfit-grid">${outfits.map(o=>`
      <button class="outfit-btn ${o.id===cur?'active':''}" data-outfit="${o.id}">${o.name}</button>
    `).join('')}</div>
  `
  host.querySelectorAll('.outfit-btn').forEach(b=>{
    b.addEventListener('click', ()=> selectOutfit(b.dataset.outfit))
  })
}

let _selectingModel = false
async function selectModel(id){
  if(_selectingModel) return
  _selectingModel = true
  try{
  const wasSameModel = params.modelId===id
  params.modelId = id
  // reset outfit to default when switching character (or keep if still valid)
  const outfits = getOutfitsForModel(id)
  const curOut = currentOutfitId()
  if(!outfits.some(o=>o.id===curOut)){
    params.outfitId = outfits[0]?.id || 'default'
  }
  document.querySelectorAll('.model-card').forEach(el=> el.classList.toggle('active', el.dataset.id===id))
  renderOutfitPicker()
  if(wasSameModel && mmdMesh){
    // still refresh picker but don't reload same file unless outfit changed
    return
  }
  // load with resolved outfit file
  const file = resolveModelFile(id, currentOutfitId())
  const m = { ...MODELS.find(x=>x.id===id), file }
  await loadModel(m)
  } finally { _selectingModel = false }
}

let _selectingOutfit = false
async function selectOutfit(outfitId){
  if(_selectingOutfit) return
  const modelId = params.modelId
  const outfits = getOutfitsForModel(modelId)
  if(!outfits.some(o=>o.id===outfitId)) return
  const file = resolveModelFile(modelId, outfitId)
  // avoid reloading if already on this exact file
  if(mmdMesh && mmdMesh.userData && mmdMesh.userData.__lastFile === file && params.outfitId===outfitId) return
  _selectingOutfit = true
  try{
    params.outfitId = outfitId
    renderOutfitPicker()
    const base = getModelById(modelId)
    const m = { ...base, file }
    await loadModel(m)
  } finally {
    _selectingOutfit = false
  }
}

let _selectingAnim = false
async function selectAnimation(id){
  if(_selectingAnim) return
  _selectingAnim = true
  try{
  params.animId = id
  document.querySelectorAll('#animList .anim-btn').forEach(el=> {
    el.classList.toggle('active', el.dataset.id===id)
  })
  if(mmdMesh){
    await loadAnimationForCurrentModel()
  }
  } finally { _selectingAnim = false }
}

// Core loaders
async function loadModel(model){
  setLoaderStage(1, `Loading ${model.name}…`, 15, model.file)
  setStatus('Loading ' + model.name + '…', 'warn')
  await ensureAmmo()
  createHelper()
  if(mmdMesh){
    scene.remove(mmdMesh)
    mmdMesh = null
  }
  // yield so loader paints before heavy MMD load
  await new Promise(r=>setTimeout(r, 30))
  setLoaderStage(1, `Loading ${model.name}…`, 22, 'Fetching textures…')
  const url = encodeURI(model.file)

  const pmx = await new Promise((resolve, reject)=>{
    let lastPct = 0
    loader.load(url, resolve, (e)=>{
      if(e.lengthComputable){
        const p = Math.round(e.loaded / e.total * 100)
        // throttle DOM writes to ~30fps
        if(Math.abs(p-lastPct) < 3 && p < 99) return
        lastPct = p
        const overall = 22 + p*0.42 // 22→64
        setLoaderStage(1, `Loading ${model.name}…`, overall, p + '% • ' + model.jp)
        // also bump secondary bar
        const sb = document.getElementById('loaderSubBar')
        if(sb) sb.style.width = p + '%'
      } else {
        bumpLoader(`Loading ${model.name}…`, 35, 'Streaming…')
      }
    }, reject)
  }).catch(err=>{
    console.error(err)
    setStatus('Failed to load model', 'err')
    setLoader(false)
    toast('Failed to load ' + model.name + ' — check pmx path', 3500)
    throw err
  })

  mmdMesh = pmx
  mmdMesh.userData = mmdMesh.userData || {}
  mmdMesh.userData.__lastFile = model.file
  mmdMesh.position.y = 0

  if(mmdMesh.geometry?.userData?.MMD){
    sanitizePhysics(mmdMesh.geometry.userData.MMD)
  }

  // ---- Game face lightmap fix ----
  // Genshin/ZZZ uses a lightmap/SDF with face-forward (dot(F,L) not dot(N,L)) so
  // the face never goes dark in side light. We emulate without external textures:
  //  - soft 1D gradient for face (not harsh skin.bmp)
  //  - emissive boost so face albedo stays visible even at dotNL=-1
  //  - no cast/receive shadow for face to avoid nose acne
  function isFaceMat(mat){
    const n = (mat.name||'').trim()
    // only the skin base, not eyes/brow/lash (they share 颜.tga but have different names)
    // exact match for face skin; eye mats are 目/白目/睫/眉
    return n === '颜' || n === '颜2' || n === '顔' || n === 'Face' || n.toLowerCase() === 'face'
  }
  function createSoftFaceGradient(){
    try{
      const c = document.createElement('canvas'); c.width = 256; c.height = 1
      const g = c.getContext('2d')
      const grad = g.createLinearGradient(0,0,256,0)
      // soft ramp: shadow 0.65 → mid 0.88 → lit 1.0 (was skin.bmp ~0.45 harsh)
      grad.addColorStop(0.00, '#a6a6a6')
      grad.addColorStop(0.35, '#c2c2c2')
      grad.addColorStop(0.55, '#e2e2e2')
      grad.addColorStop(0.75, '#f2f2f2')
      grad.addColorStop(1.00, '#ffffff')
      g.fillStyle = grad; g.fillRect(0,0,256,1)
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.NoColorSpace
      tex.minFilter = THREE.NearestFilter
      tex.magFilter = THREE.NearestFilter
      tex.wrapS = THREE.ClampToEdgeWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.needsUpdate = true
      return tex
    }catch{ return null }
  }
  const _faceGradient = createSoftFaceGradient()
  let _faceMeshes = []
  let _faceMatCount = 0
  mmdMesh.traverse(o=>{
    if(o.isMesh){
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      const anyFace = mats.some(isFaceMat)
      // keep shadow for all — face lightmap handles nose acne, not shadow disable
      o.castShadow = true
      o.receiveShadow = false
      if(anyFace) _faceMeshes.push(o)
      mats.forEach(mat=>{
        // base
        const wasFace = isFaceMat(mat)
        if(mat.emissive){
          // gentle lift for face only — was 0.12, now 0.32 keeps details visible without blowing out
          mat.emissiveIntensity = wasFace ? 0.32 : 0.12
          if(wasFace) mat.emissive.set(0xffffff) // keep original hue, just brighter
        }
        mat.alphaToCoverage = false
        if(mat.transparent) mat.depthWrite = false
        else mat.depthWrite = true
        // face lightmap — minimal, non-destructive
        if(wasFace){
          _faceMatCount++
          // soft gradient: keep skin.bmp but make it brighter if we have our soft ramp
          // Only replace if the original is harsh skin.bmp (32px). Our 256 ramp is softer.
          // Keep emissiveMap as null — using same map as diffuse doubles the texture fetch and can wash out.
          // Instead, just lift emissive slightly and soften gradient.
          if(_faceGradient && mat.gradientMap){
            // check if original gradient is small (32x32) — replace with soft
            try{
              const img = mat.gradientMap.image
              const w = img?.width || 0
              if(w <= 32){
                mat.gradientMap = _faceGradient
                mat.needsUpdate = true
              }
            }catch{
              mat.gradientMap = _faceGradient
              mat.needsUpdate = true
            }
          }
          if('roughness' in mat) mat.roughness = 0.85
          if('metalness' in mat) mat.metalness = 0.02
        }
      })
    }
  })
  // expose for debug
  window._faceMeshes = _faceMeshes
  console.log(`[face] fixed ${_faceMeshes.length} meshes, ${_faceMatCount} face mats, gradient=${!!_faceGradient}`)
  // quick toggle for debugging invisible face: window.__faceFixOff()
  window.__faceFixOff = ()=>{
    _faceMeshes.forEach(m=>{
      const mats = Array.isArray(m.material)? m.material:[m.material]
      mats.forEach(mat=>{ if(isFaceMat(mat) && mat.emissive) mat.emissiveIntensity=0.12 })
    })
    console.log('[face] fix off — emissive 0.12')
  }
  window.__faceFixOn = ()=>{
    _faceMeshes.forEach(m=>{
      const mats = Array.isArray(m.material)? m.material:[m.material]
      mats.forEach(mat=>{ if(isFaceMat(mat) && mat.emissive){ mat.emissive.set(0xffffff); mat.emissiveIntensity=0.32 }})
    })
    console.log('[face] fix on — emissive 0.32')
  }
  // bind head bone for faceLight tracking (game lightmap)
  try{ bindHeadBone() }catch{}

  // apply persisted model offset/rotation (looking direction) before physics bind
  try{ _applyModelDbg() }catch{}
  scene.add(mmdMesh)
  mmdMesh.pose()
  if(mmdMesh.morphTargetInfluences) mmdMesh.morphTargetInfluences.fill(0)
  mmdMesh.updateMatrixWorld(true)
  // re-apply after pose (pose resets rot/pos) so yaw persists
  try{ _applyModelDbg() }catch{}
  helper.add(mmdMesh, {
     animation: undefined,
     physics: params.physics,
     gravity: PHYSICS_DEFAULTS.gravity,
     unitStep: PHYSICS_DEFAULTS.unitStep,
     maxStepNum: PHYSICS_DEFAULTS.maxStepNum,
     warmup: PHYSICS_DEFAULTS.warmup,
   })
  // staggered warmup — don't block main thread (lmao we got bars for this)
  bumpLoader('Physics', 68, 'Warming cloth/hair…')
  const warmObj = helper.objects.get(mmdMesh)?.physics
  if(warmObj?.warmup){
    try{ warmObj.warmup(12) }catch{}
    // remaining steps async
    setTimeout(()=>{ try{ warmObj.warmup(8) }catch{} bumpLoader('Physics', 75, 'Almost there…') }, 32)
  }
  $('#gravity').value = PHYSICS_DEFAULTS.gravity.y
  $('#gravVal').textContent = PHYSICS_DEFAULTS.gravity.y.toFixed(1)

  helper.enable('physics', params.physics)
  helper.enable('ik', params.ik)

  setLoaderStage(3, 'Physics', 72, 'Binding bones…')
  await new Promise(r=>setTimeout(r, 16))
  await loadAnimationForCurrentModel(true)

  setLoaderStage(4, 'Ready', 100, 'Done ♡')
  await new Promise(r=>setTimeout(r, 280))
  setLoader(false)
  setStatus('Ready • ' + model.name)
  toast('Loaded ' + model.name)
  focusCamera()
}

function hardResetPoseAndPhysics(){
  if(!mmdMesh || !helper) return
  try{
    const obj = helper.objects.get(mmdMesh)
    if(obj){
      if(obj.mixer){
        try{ obj.mixer.stopAllAction(); obj.mixer.setTime(0); }catch{}
      }
      if(obj.physics){
        try{ obj.physics.reset(); }catch{}
      }
      if(obj.backupBones) obj.backupBones = undefined
      if(obj.mixer) { try{ obj.mixer._bindings = []; obj.mixer._nActiveBindings = 0 }catch{} }
    }
  }catch{}
  try{ helper.remove(mmdMesh) }catch{}
  try{ mmdMesh.pose(); }catch{}
  if(mmdMesh.morphTargetInfluences) mmdMesh.morphTargetInfluences.fill(0)
  mmdMesh.updateMatrixWorld(true)
  if(mmdMesh.morphTargetInfluences && mmdMesh.morphTargetDictionary){
    const n = Object.keys(mmdMesh.morphTargetDictionary).length
    if(mmdMesh.morphTargetInfluences.length !== n){
      mmdMesh.morphTargetInfluences = new Array(n).fill(0)
    }
    for(let i=0;i<mmdMesh.morphTargetInfluences.length;i++) if(mmdMesh.morphTargetInfluences[i]==null) mmdMesh.morphTargetInfluences[i]=0
  }
  // keep yaw/offset after reset
  try{ _applyModelDbg() }catch{}
}

async function loadAnimationForCurrentModel(isModelLoad=false){
  const anim = ANIMATIONS.find(a=> a.id===params.animId)
  const useFile = anim?.file || null

  hardResetPoseAndPhysics()

  if(!useFile){
    currentVmd = null
    helper.add(mmdMesh, {
      physics: params.physics,
      animation: undefined,
      gravity: new THREE.Vector3(0, parseFloat($('#gravity').value), 0),
      unitStep: PHYSICS_DEFAULTS.unitStep,
      maxStepNum: PHYSICS_DEFAULTS.maxStepNum,
      warmup: PHYSICS_DEFAULTS.warmup,
    })
    helper.enable('physics', params.physics)
    helper.enable('ik', params.ik)
    try{ helper.objects.get(mmdMesh).physics?.warmup(40) }catch{}
    try{ _applyModelDbg() }catch{ mmdMesh.scale.x = params.mirror ? -1 : 1 }
    setStatus('No animation • ' + (MODELS.find(m=>m.id===params.modelId)?.name || '' ) )
    if(!isModelLoad) toast('Static pose')
    return
  }

  setLoaderStage(3, 'VMD', 40, anim.name)
  setStatus('Loading VMD…', 'warn')
  await new Promise(r=>setTimeout(r, 16))
  const url = encodeURI(anim.file)

  const _warn = console.warn
  let suppressedBinding = 0
  console.warn = (...a)=>{ const s=String(a[0]||''); if(s.includes('PropertyBinding') && s.includes('is undefined')){ suppressedBinding++; return } _warn.apply(console,a) }
  const clip = await new Promise((resolve, reject)=>{
    let lastP = 0
    loader.loadAnimation(url, mmdMesh, (vmd)=>{
      resolve(vmd)
    }, (e)=>{
      if(e.lengthComputable){
        const p = Math.round(e.loaded / (e.total||1) * 100)
        if(Math.abs(p-lastP) < 4 && p < 99) return
        lastP = p
        setLoaderStage(3, 'VMD', 40 + p*0.45, p + '% • ' + anim.name)
      } else {
        bumpLoader('VMD', 55, 'Streaming…')
      }
    }, reject)
  }).catch(err=>{
    console.warn = _warn
    console.error('vmd load failed', err)
    setStatus('VMD failed', 'err')
    toast('Failed to load VMD', 3000)
    setLoader(false)
    try{ helper.add(mmdMesh, { physics: params.physics, animation: undefined, gravity: new THREE.Vector3(0, parseFloat($('#gravity').value),0), unitStep: PHYSICS_DEFAULTS.unitStep, maxStepNum: PHYSICS_DEFAULTS.maxStepNum }) }catch{}
    helper.enable('physics', params.physics)
    helper.enable('ik', params.ik)
    return null
  })
  console.warn = _warn
  if(suppressedBinding) console.log(`[vmd] suppressed ${suppressedBinding} missing-target track warnings`)
  if(!clip) { setLoader(false); return }

  if(mmdMesh.morphTargetInfluences && mmdMesh.morphTargetDictionary){
    const n = Object.keys(mmdMesh.morphTargetDictionary).length
    if(mmdMesh.morphTargetInfluences.length !== n) mmdMesh.morphTargetInfluences = new Array(n).fill(0)
    for(let i=0;i<n;i++) if(mmdMesh.morphTargetInfluences[i]==null) mmdMesh.morphTargetInfluences[i]=0
  }

  try{ _applyModelDbg() }catch{ mmdMesh.scale.x = params.mirror ? -1 : 1 }

  helper.add(mmdMesh, {
    animation: clip,
    physics: params.physics,
    gravity: new THREE.Vector3(0, parseFloat($('#gravity').value), 0),
    unitStep: PHYSICS_DEFAULTS.unitStep,
    maxStepNum: PHYSICS_DEFAULTS.maxStepNum,
    warmup: PHYSICS_DEFAULTS.warmup,
  })
  setLoaderStage(3, 'VMD', 86, 'Warming…')
  const pWarm2 = helper.objects.get(mmdMesh)?.physics
  if(pWarm2?.warmup){ try{ pWarm2.warmup(10) }catch{} setTimeout(()=>{ try{ pWarm2.warmup(6)}catch{} }, 20) }
  const obj = helper.objects.get(mmdMesh)
  if(obj && obj.mixer){
    obj.mixer.timeScale = params.speed
    const actions = obj.mixer._actions || []
    actions.forEach(a=>{
      a.setLoop(params.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      a.clampWhenFinished = !params.loop
      a.reset().play()
    })
  }
  helper.enable('physics', params.physics)
  helper.enable('ik', params.ik)

  currentVmd = clip

  setLoaderStage(4, 'Ready', 100, 'Done ♡')
  await new Promise(r=>setTimeout(r, 220))
  setLoader(false)
  setStatus('Playing • ' + anim.name + ` • ${params.speed.toFixed(2)}×`)
  if(!isModelLoad) toast('Playing ' + anim.name)
}

function focusCamera(){
  if(!mmdMesh) return
  // baked framing: model at -20,-0.35,4.7 → look near her head; keep freecam target
  const s = getSettingsRaw()
  if(s.backgroundId && s.backgroundId!=='gradient' && s.backgroundId!=='solid'){
    controls.target.set(-20.48, 15.605, 5.917)
  } else {
    controls.target.set(0, 9, 0)
  }
  controls.update()
}

// Controls wiring
$('#btnPlay').addEventListener('click', ()=>{
  const obj = helper?.objects?.get(mmdMesh)
  if(obj?.mixer){
    obj.mixer.timeScale = Math.abs(params.speed) || 1
    helper.enable('animation', true)
    setStatus('Playing')
  }
})
$('#btnPause').addEventListener('click', ()=>{
  const obj = helper?.objects?.get(mmdMesh)
  if(obj?.mixer){
    obj.mixer.timeScale = 0
    setStatus('Paused', 'warn')
  }
})
$('#btnReset').addEventListener('click', async ()=>{
  if(!mmdMesh || !helper) return
  const isNone = params.animId==='none'
  hardResetPoseAndPhysics()
  const g = new THREE.Vector3(0, parseFloat($('#gravity').value), 0)
  if(currentVmd && !isNone){
    helper.add(mmdMesh, { animation: currentVmd, physics: params.physics, gravity: g, unitStep: PHYSICS_DEFAULTS.unitStep, maxStepNum: PHYSICS_DEFAULTS.maxStepNum })
    try{ helper.objects.get(mmdMesh).physics?.warmup(30) }catch{}
    const obj = helper.objects.get(mmdMesh)
    if(obj?.mixer){
      obj.mixer.timeScale = params.speed
      obj.mixer._actions?.forEach(a=>{ a.reset().play(); })
    }
    helper.enable('physics', params.physics)
    helper.enable('ik', params.ik)
  } else {
    helper.add(mmdMesh, { physics: params.physics, animation: undefined, gravity: g, unitStep: PHYSICS_DEFAULTS.unitStep, maxStepNum: PHYSICS_DEFAULTS.maxStepNum })
    try{ helper.objects.get(mmdMesh).physics?.warmup(40) }catch{}
    helper.enable('physics', params.physics)
    helper.enable('ik', params.ik)
  }
  try{ _applyModelDbg() }catch{ mmdMesh.scale.x = params.mirror ? -1 : 1 }
  setStatus('Reset — T-pose')
  toast('Reset pose + physics')
})
$('#speed').addEventListener('input', e=>{
  params.speed = parseFloat(e.target.value)
  $('#speedVal').textContent = params.speed.toFixed(2) + '×'
  const obj = helper?.objects?.get(mmdMesh)
  if(obj?.mixer && obj.mixer.timeScale!==0) obj.mixer.timeScale = params.speed
})
$('#loopChk').addEventListener('change', e=>{
  params.loop = e.target.checked
  const obj = helper?.objects?.get(mmdMesh)
  if(obj?.mixer){
    obj.mixer._actions?.forEach(a=>{
      a.setLoop(params.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      a.clampWhenFinished = !params.loop
    })
  }
})
$('#mirrorChk').addEventListener('change', e=>{
  params.mirror = e.target.checked
  try{ _applyModelDbg() }catch{ if(mmdMesh) mmdMesh.scale.x = params.mirror ? -1 : 1 }
})
$('#physicsChk').addEventListener('change', e=>{
  params.physics = e.target.checked
  helper?.enable('physics', params.physics)
  setStatus('Physics ' + (params.physics?'ON':'OFF'), params.physics?'':'warn')
})
$('#ikChk').addEventListener('change', e=>{
  params.ik = e.target.checked
  helper?.enable('ik', params.ik)
})
$('#gravity')?.addEventListener('input', e=>{
  const v = parseFloat(e.target.value)
  $('#gravVal').textContent = v.toFixed(1)
  setSettings({ gravity: v })
  updatePhysicsGravity(v)
})
$('#keyIntensity')?.addEventListener('input', e=>{
  const v = parseFloat(e.target.value)
  $('#keyVal').textContent = v.toFixed(1)
  keyLight.intensity = v
  setSettings({ keyIntensity: v })
})
$('#fillIntensity')?.addEventListener('input', e=>{
  const v = parseFloat(e.target.value)
  $('#fillVal').textContent = v.toFixed(2)
  fillLight.intensity = v
  setSettings({ fillIntensity: v })
})
$('#rimIntensity')?.addEventListener('input', e=>{
  const v = parseFloat(e.target.value)
  $('#rimVal').textContent = v.toFixed(1)
  rimLight.intensity = v
  setSettings({ rimIntensity: v })
})
$('#exposure')?.addEventListener('input', e=>{
  const v = parseFloat(e.target.value)
  $('#expVal').textContent = v.toFixed(2)
  renderer.toneMappingExposure = v
  setSettings({ exposure: v })
})
$('#shadowChk')?.addEventListener('change', e=>{
  renderer.shadowMap.enabled = e.target.checked
  keyLight.castShadow = e.target.checked
  setSettings({ shadows: e.target.checked })
})
$('#groundChk')?.addEventListener('change', e=>{
  ground.mesh.visible = e.target.checked
  ground.grid.visible = e.target.checked
  ground.line.visible = e.target.checked
  setSettings({ ground: e.target.checked })
})
$('#autoRotateChk')?.addEventListener('change', e=>{
  params.autoRotate = e.target.checked
})
document.querySelectorAll('[data-cam]').forEach(b=>{
  b.addEventListener('click', ()=>{
    const t = b.dataset.cam
    const pos = {
      front:[0, 13.2, 22],
      side:[22, 13, 0],
      back:[0, 13, -22],
      top:[0, 32, 0.1],
    }[t]
    if(!pos) return
    const start = camera.position.clone()
    const target = new THREE.Vector3(...pos)
    let u = 0
    const step = () => {
      u = Math.min(1, u + 0.04)
      const k = 1 - Math.pow(1-u, 3)
      camera.position.lerpVectors(start, target, k)
      if(t==='top') camera.position.x = 0.1
      if(u<1) requestAnimationFrame(step)
    }
    step()
    controls.target.set(0,9,0)
  })
})

function lerpCameraTo(preset){
  const pos = { front:[0,13.2,22], side:[22,13,0], back:[0,13,-22], top:[0,32,0.1] }[preset]
  if(!pos) return
  const start = camera.position.clone()
  const target = new THREE.Vector3(...pos)
  let u=0
  const step=()=>{
    u=Math.min(1,u+0.04); const k=1-Math.pow(1-u,3)
    camera.position.lerpVectors(start,target,k)
    if(preset==='top') camera.position.x=0.1
    if(u<1) requestAnimationFrame(step)
  }
  step()
  controls.target.set(0,9,0)
}

// ---- Settings modal + store wiring ----
let settingsModal = null
let setupWizard = null
let _hitboxCleanup = null
let _eyeTracker = null
function applySettingsPatch(changed){
  if(!changed) return
  if('keyIntensity' in changed) { keyLight.intensity = changed.keyIntensity; const e=document.getElementById('keyIntensity'); if(e&&document.activeElement!==e) e.value=changed.keyIntensity; const v=document.getElementById('keyVal'); if(v) v.textContent=Number(changed.keyIntensity).toFixed(1) }
  if('fillIntensity' in changed) { fillLight.intensity = changed.fillIntensity; const e=document.getElementById('fillIntensity'); if(e&&document.activeElement!==e) e.value=changed.fillIntensity; const v=document.getElementById('fillVal'); if(v) v.textContent=Number(changed.fillIntensity).toFixed(2) }
  if('rimIntensity' in changed) { rimLight.intensity = changed.rimIntensity; const e=document.getElementById('rimIntensity'); if(e&&document.activeElement!==e) e.value=changed.rimIntensity; const v=document.getElementById('rimVal'); if(v) v.textContent=Number(changed.rimIntensity).toFixed(1) }
  if('backIntensity' in changed) backLight.intensity = changed.backIntensity
  if('ambientIntensity' in changed) ambient.intensity = changed.ambientIntensity
  if('exposure' in changed) { renderer.toneMappingExposure = changed.exposure; const e=document.getElementById('exposure'); if(e&&document.activeElement!==e) e.value=changed.exposure; const v2=document.getElementById('expVal'); if(v2) v2.textContent=Number(changed.exposure).toFixed(2) }
  if('shadows' in changed){ renderer.shadowMap.enabled = changed.shadows; keyLight.castShadow = changed.shadows; const e=document.getElementById('shadowChk'); if(e) e.checked=!!changed.shadows }
  if('ground' in changed){ ground.mesh.visible=!!changed.ground; ground.grid.visible=!!changed.ground; ground.line.visible=!!changed.ground; const e=document.getElementById('groundChk'); if(e) e.checked=!!changed.ground }
  if('dprCap' in changed || 'shadowRes' in changed) applyRendererSize()
  if('fov' in changed){ camera.fov = changed.fov; camera.updateProjectionMatrix() }
  if('dampingFactor' in changed) controls.dampingFactor = changed.dampingFactor
  if('minDistance' in changed) controls.minDistance = changed.minDistance
  if('maxDistance' in changed) controls.maxDistance = changed.maxDistance
  if('maxPolarAngle' in changed) controls.maxPolarAngle = changed.maxPolarAngle
  if('minPolarAngle' in changed) controls.minPolarAngle = changed.minPolarAngle
  if('physics' in changed){ helper?.enable('physics', !!changed.physics); const e=document.getElementById('physicsChk'); if(e) e.checked=!!changed.physics }
  if('ik' in changed){ helper?.enable('ik', !!changed.ik); const e=document.getElementById('ikChk'); if(e) e.checked=!!changed.ik }
  if('gravity' in changed){ const e=document.getElementById('gravity'); if(e&&document.activeElement!==e) e.value=changed.gravity; const gv=document.getElementById('gravVal'); if(gv) gv.textContent=Number(changed.gravity).toFixed(1); updatePhysicsGravity(changed.gravity) }
  if('speed' in changed){ const e=document.getElementById('speed'); if(e&&document.activeElement!==e) e.value=changed.speed; const sv=document.getElementById('speedVal'); if(sv) sv.textContent=Number(changed.speed).toFixed(2)+'×'; const obj=helper?.objects?.get(mmdMesh); if(obj?.mixer && obj.mixer.timeScale!==0) obj.mixer.timeScale=changed.speed }
  if('loop' in changed){ const e=document.getElementById('loopChk'); if(e) e.checked=!!changed.loop; const obj=helper?.objects?.get(mmdMesh); if(obj?.mixer) obj.mixer._actions?.forEach(a=>{ a.setLoop(changed.loop?THREE.LoopRepeat:THREE.LoopOnce,Infinity); a.clampWhenFinished=!changed.loop }) }
  if('mirror' in changed){ const e=document.getElementById('mirrorChk'); if(e) e.checked=!!changed.mirror; try{ _applyModelDbg() }catch{ if(mmdMesh) mmdMesh.scale.x = changed.mirror ? -1 : 1 } }
  if('autoRotate' in changed){ const e=document.getElementById('autoRotateChk'); if(e) e.checked=!!changed.autoRotate }
  if('premium' in changed){ const e=document.getElementById('premiumChk'); if(e) e.checked=!!changed.premium; if(waifu) waifu.premium=!!changed.premium }
  if('prosodyRate' in changed && waifu) waifu.prosodyRate = changed.prosodyRate
  if('prosodyPitch' in changed && waifu) waifu.prosodyPitch = changed.prosodyPitch
  if('panelCollapsed' in changed){ const wantOpen = !changed.panelCollapsed; const isOpen = panelEl && !panelEl.classList.contains('collapsed'); if(wantOpen!==isOpen) togglePanel(wantOpen) }
  if('modelId' in changed){
    document.querySelectorAll('.model-card').forEach(el=> el.classList.toggle('active', el.dataset.id===changed.modelId))
    renderOutfitPicker()
    const m = MODELS.find(x=>x.id===changed.modelId); if(m && mmdMesh && !_selectingModel) { /* user switched via settings */ selectModel(changed.modelId) }
    const cm=document.getElementById('chatModel'); if(cm) cm.textContent=changed.modelId
  }
  if('outfitId' in changed){
    renderOutfitPicker()
    // external patch (file sync) — load if not already selecting
    if(mmdMesh && !_selectingOutfit) {
      const expected = resolveModelFile(getSettingsRaw().modelId, changed.outfitId)
      const currentFile = mmdMesh.userData?.__lastFile || ''
      if(expected && expected !== currentFile) selectOutfit(changed.outfitId)
    }
  }
  if('animId' in changed){
    document.querySelectorAll('#animList .anim-btn').forEach(el=> el.classList.toggle('active', el.dataset.id===changed.animId))
    if(mmdMesh && !_selectingAnim) selectAnimation(changed.animId)
  }
  if('affinity' in changed){ const el=document.getElementById('affinityVal'); if(el) el.textContent=Number(changed.affinity).toFixed(2); const bar=document.querySelector('#affinityBar i'); if(bar) bar.style.width=(Number(changed.affinity)*100).toFixed(0)+'%' }
  if('backgroundId' in changed){ applyBackground(changed.backgroundId, scene); renderBgGrid() }
  if('backgroundBlur' in changed){ /* reserved */ }
}

function initSettingsModal(){
  settingsModal = mountSettingsModal({
    containerId: 'settingsRoot',
    getModels: ()=> MODELS,
    getAnims: ()=> ANIMATIONS,
    onAction: (a)=>{
      if(a.type==='selectModel') selectModel(a.id)
      else if(a.type==='selectOutfit') selectOutfit(a.id)
      else if(a.type==='selectAnim') selectAnimation(a.id)
      else if(a.type==='play') document.getElementById('btnPlay')?.click()
      else if(a.type==='pause') document.getElementById('btnPause')?.click()
      else if(a.type==='resetPose') document.getElementById('btnReset')?.click()
      else if(a.type==='cam') lerpCameraTo(a.preset)
      else if(a.type==='resetCamera'){ camera.position.set(0,13.2,22); controls.target.set(0,9,0); controls.update(); toast('Camera reset') }
      else if(a.type==='wpkgOpen') window.wpkgEditor?.open()
      else if(a.type==='wpkgReload') document.getElementById('btnWpkgReload')?.click()
      else if(a.type==='toast') toast(a.text)
      else if(a.type==='settingsImported'){ applyInitialSettings(); applyRendererSize(); if(waifu) waifu.premium=!!getSettingsRaw().premium; toast('Settings imported ♡') }
      else if(a.type==='field'){ applySettingsPatch({ [a.field]: a.value }) }
      else if(a.type==='export'){ /* handled inside modal */ }
      else if(a.type==='rerunSetup'){ setupWizard?.open() }
    }
  })
  window.settingsModal = settingsModal
  onSettingsChange((next, changed)=> applySettingsPatch(changed))
  document.getElementById('btnSettings')?.addEventListener('click', ()=> settingsModal.open())
  // keyboard: Ctrl+, and plain , when not typing
  addEventListener('keydown', (e)=>{
    if((e.ctrlKey||e.metaKey) && e.key===','){ e.preventDefault(); if(settingsModal.isOpen()) settingsModal.close(); else settingsModal.open(); }
    else if(e.key===',' && !e.ctrlKey && !e.metaKey && !e.altKey){
      const tag=(document.activeElement?.tagName||'').toLowerCase()
      if(tag==='input'||tag==='textarea'||tag==='select') return
      // avoid hijacking when typing chat
      if(document.activeElement?.id==='chatInput') return
      settingsModal.open()
    }
  })
}
initSettingsModal()
const __ver = initVersionManager({ pollIntervalMs: 15000, checkOnFocus: true, autoReload: false })
try{
  const el=document.getElementById('appVersion')
  if(el){
    const v = __ver.getCurrent?.().version || (typeof __APP_VERSION__!=='undefined'?__APP_VERSION__:'EU-0.3.7-02')
    el.textContent='v'+v
    el.title=`v${v} • click to check for updates`
    el.style.cursor='pointer'
    el.addEventListener('click', ()=> { __ver.check({silent:false}); toast('Checking for updates…') })
  }
}catch{}

// ---- Setup wizard (first-boot onboarding) ----
function initSetupWizard(){
  setupWizard = mountSetupWizard({
    containerId: 'setupWizardRoot',
    getModels: ()=> MODELS,
    onFinish: ({ skipped })=>{
      applyInitialSettings()
      applyRendererSize()
      if(!skipped) toast('Setup complete ♡')
      // if stage not yet entered, go there now
      try{ if(!bootStarted) enterStage() }catch{}
    }
  })
  window.setupWizard = setupWizard
  // auto-heal: if keys already present but still not onboarded (e.g. user set key via Settings before finishing wizard), mark done so wizard stops nagging
  try{
    const s = getSettingsRaw()
    if(!s.onboarded && (s.openrouterApiKey || s.groqApiKey)) setOnboarded(true)
  }catch{}
  // first-boot: show macOS-like setup immediately (covers main menu)
  if(setupWizard.shouldShow()){
    try{ document.getElementById('mainMenu')?.classList.add('hidden') }catch{}
    setTimeout(()=> setupWizard.open(), 400)
  } else {
    // with main menu present, don't auto-popup over it; only auto-show if menu dismissed
    const menuDismissed = (()=>{ try{ return sessionStorage.getItem('waifu:menuDismissed')==='1'}catch{return false} })()
    if(menuDismissed && setupWizard.shouldShow()){
      setTimeout(()=> setupWizard.open(), 700)
    }
  }
  // also try to sync existing local keys to backend on boot (covers case where backend was offline when key was pasted)
  // first pull backend model so manual backend edits are adopted, then push local state
  try{
    fetch('/api/keys').then(r=>r.json()).then(j=>{
      if(j?.openrouter_model && j.openrouter_model !== getSettingsRaw().openrouterModel){
        setSettings({ openrouterModel: j.openrouter_model })
      }
    }).catch(()=>{}).finally(()=>{
      try{
        const s2 = getSettingsRaw()
        // push if any key exists or model is non-default
        if(s2.openrouterApiKey || s2.groqApiKey || s2.elevenlabsApiKey || s2.fishApiKey || s2.openrouterModel !== SETTINGS_DEFAULTS.openrouterModel){
          fetch('/api/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            openrouter_api_key: s2.openrouterApiKey||'',
            groq_api_key: s2.groqApiKey||'',
            elevenlabs_api_key: s2.elevenlabsApiKey||'',
            fish_api_key: s2.fishApiKey||'',
            openrouter_model: s2.openrouterModel||'',
          })}).catch(()=>{})
        }
      }catch{}
    })
  }catch{}
}
initSetupWizard()

// ---- Waifu backend bridge ----
let morphDriver = null
let waifu = null
function initWaifuBridge() {
  morphDriver = createMorphDriver(() => mmdMesh)
  const chatLog = $('#chatLog')
  const wsState = $('#wsState')
  const chatModel = $('#chatModel')
  let assistantBuffer = ''
  let assistantPartialEl = null

  function appendLog(role, text, cls='') {
    if (!chatLog) return
    const div = document.createElement('div')
    div.className = 'msg ' + role + (cls ? ' ' + cls : '')
    div.textContent = text
    chatLog.appendChild(div)
    chatLog.classList.add('has-messages')
    chatLog.scrollTop = chatLog.scrollHeight
    return div
  }

  waifu = new WaifuClient({
    onStatus: (txt, cls) => { setStatus(txt, cls); if (wsState) wsState.textContent = txt },
    getModelId: () => params.modelId,
    getLlmModel: () => getSettingsRaw().openrouterModel || null,
    getMorphController: () => morphDriver,
    onChatMessage: (msg) => {
      if (msg.role === 'user') {
        appendLog('user', msg.text)
        if (chatModel) chatModel.textContent = params.modelId
        assistantBuffer = ''
        if (assistantPartialEl) { assistantPartialEl.remove(); assistantPartialEl = null }
      } else if (msg.role === 'assistant') {
        if (msg.token) {
          assistantBuffer += msg.token
          if (!assistantPartialEl) assistantPartialEl = appendLog('assistant', assistantBuffer, 'partial')
          else assistantPartialEl.textContent = assistantBuffer
          // try to show incremental json text if buffer looks like json
          try {
            const maybe = JSON.parse(assistantBuffer)
            if (maybe.text) assistantPartialEl.textContent = maybe.text
          } catch {}
        }
        if (msg.full_text) {
          if (assistantPartialEl) { assistantPartialEl.remove(); assistantPartialEl = null }
          appendLog('assistant', msg.full_text + (msg.emotion ? ` 〔${msg.emotion}/${msg.gesture}〕` : ''))
          assistantBuffer = ''
        }
      }
    }
  })
  waifu.connect()

  // expose for debug
  window.waifu = waifu
  window.morphDriver = morphDriver
  // mount wpkg editor (hidden until button)
  try { const ed = mountWpkgEditor(); window.wpkgEditor = ed; } catch(e){ console.warn('wpkg editor mount failed', e) }

  // tools: hitboxing + eye tracking (respect settings toggles)
  const s0 = getSettingsRaw()
  if(s0.hitboxing){
    try {
      const handler = (zone) => {
        if(!getSettingsRaw().hitboxing) return
        if (zone === 'head') { morphDriver?.setTalking(true, 'shy'); setTimeout(()=>morphDriver?.setTalking(false,'neutral'), 900); toast(zone+' pat ♡'); affinity.bump(0.01); }
        else if (zone === 'chest') { toast('…!'); morphDriver?.setTalking(true,'surprised'); setTimeout(()=>morphDriver?.setTalking(false,'neutral'),600); }
        else { toast(zone+' poke'); }
      }
      setupHitboxing(renderer, camera, () => mmdMesh, handler);
    } catch(e){ console.warn('hitbox',e) }
  }
  try {
    const tracker = setupEyeTracking(camera, () => mmdMesh, renderer);
    _eyeTracker = tracker
    const origTick = morphDriver.tick.bind(morphDriver);
    morphDriver.tick = (dt, ctxTime, viseme) => {
      origTick(dt, ctxTime, viseme);
      if(getSettingsRaw().eyeTracking) tracker.tick(mmdMesh, dt);
    };
  } catch(e){ console.warn('eye track',e) }
  // init premium / prosody from store
  waifu.premium = !!getSettingsRaw().premium
  waifu.prosodyRate = getSettingsRaw().prosodyRate || 1
  waifu.prosodyPitch = getSettingsRaw().prosodyPitch || 0

  // expose hotSwap globally for chat commands + WS tool handling
  window.hotSwapVmd = (name) => hotSwapVmd(name, () => mmdMesh, helper, loader, params, setStatus, toast);
  // WS tool hooks: if server sends play_vmd etc, frontend already gets animation viseme; also listen for tool hint
  waifu._origHandle = waifu._handleMessage.bind(waifu);
  waifu._handleMessage = (msg) => {
    waifu._origHandle(msg);
    if (msg.type === 'tool' && msg.name === 'play_vmd') hotSwapVmd(msg.args?.name || msg.args?.vmd, () => mmdMesh, helper, loader, params, setStatus, toast);
    if (msg.type === 'tool' && msg.name === 'set_prosody') applyProsody(waifu, msg.args || {});
  };

  const input = $('#chatInput')
  const btnSend = $('#btnSend')
  const btnStop = $('#btnStop')
  const btnMic = $('#btnMic')
  const premiumChk = $('#premiumChk')

  function doSend() {
    const txt = input?.value?.trim()
    if (!txt) return
    // chat commands: /dance <name>, /wave, /idle, /vmd <name>
    if (txt.startsWith('/')) {
      const [cmd, ...rest] = txt.split(' ');
      const arg = rest.join(' ').trim() || 'wave';
      if (['/dance','/wave','/idle','/vmd','/motion','/play'].includes(cmd.toLowerCase())) {
        const name = cmd === '/idle' ? 'idle' : arg;
        window.hotSwapVmd?.(name);
        input.value = '';
        affinity.nudgeFromText(txt);
        return;
      }
    }
    waifu.premium = !!getSettingsRaw().premium
    // keep checkbox in sync but store is source of truth
    if(premiumChk) premiumChk.checked = !!getSettingsRaw().premium
    affinity.nudgeFromText(txt);
    waifu.sendChat(txt)
    fetch('/api/memory/store', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: txt})}).catch(()=>{});
    input.value = ''
  }
  btnSend?.addEventListener('click', doSend)
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend() })
  btnStop?.addEventListener('click', () => waifu.stop())
  premiumChk?.addEventListener('change', (e) => { waifu.premium = e.target.checked; setSettings({ premium: e.target.checked }) })
  // .wpkg editor buttons (panel)
  document.getElementById('btnWpkg')?.addEventListener('click', () => window.wpkgEditor?.open())
  document.getElementById('btnWpkgReload')?.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/wpkg/list'); const data = await r.json();
      toast(`WPKGs: ${data.map(d=>d.file).join(', ') || 'none'}`);
      window.wpkgEditor?.refreshList?.();
    } catch(e){ toast('reload failed: '+e.message) }
  })

  // STT: Web Speech API + barge-in
  let recognition = null
  let recognizing = false
  let vadStream = null
  let vadCtx = null

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return null
    const r = new SR()
    r.continuous = false
    r.interimResults = true
    r.lang = 'en-US' // will auto switch; user can speak JA too
    r.onstart = () => { recognizing = true; btnMic?.classList.add('recording'); // barge-in
      waifu.stop()
    }
    r.onend = () => { recognizing = false; btnMic?.classList.remove('recording') }
    r.onresult = (ev) => {
      let interim = '', final = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript
        if (ev.results[i].isFinal) final += t
        else interim += t
      }
      if (final) {
        if (input) input.value = final
        waifu.premium = !!getSettingsRaw().premium
        waifu.sendChat(final)
        if (input) input.value = ''
      } else if (interim) {
        if (input) input.value = interim
        if (getSettingsRaw().bargeIn && waifu?.audioCtx && waifu.scheduledSources.length) waifu.stop()
      }
    }
    r.onerror = () => { recognizing = false; btnMic?.classList.remove('recording') }
    return r
  }

  btnMic?.addEventListener('click', async () => {
    if (recognizing && recognition) { try { recognition.stop() } catch {} return }
    recognition = recognition || setupRecognition()
    if (recognition) {
      const sLang = getSettingsRaw().sttLang
      try {
        if(sLang==='auto') recognition.lang = /[\u3040-\u30ff\u4e00-\u9fff]/.test(input?.value || '') ? 'ja-JP' : 'en-US'
        else recognition.lang = sLang
      } catch {}
      try { recognition.start() } catch (e) { toast('Mic error: ' + e.message) }
    } else {
      // fallback: getUserMedia VAD barge-in demo
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        toast('Listening… speak and I will send after 1.2s silence (fallback)')
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        src.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        let silentMs = 0
        const start = performance.now()
        const iv = setInterval(() => {
          analyser.getByteFrequencyData(data)
          const vol = data.reduce((a,b)=>a+b,0)/data.length
          if (vol > 18) { silentMs = 0; waifu.stop() }
          else silentMs += 100
          if (silentMs > 1200 && performance.now() - start > 600) {
            clearInterval(iv)
            stream.getTracks().forEach(t=>t.stop())
            toast('Fallback STT needs Web Speech API — typed input used')
          }
          if (performance.now() - start > 6000) { clearInterval(iv); stream.getTracks().forEach(t=>t.stop()) }
        }, 100)
      } catch (e) { toast('Mic denied: ' + e.message) }
    }
  })

  // also barge-in on typing
  input?.addEventListener('input', () => {
    if (getSettingsRaw().bargeIn && waifu.scheduledSources?.length && input.value.length === 1) waifu.stop()
  })
}

// FPS
let fpsEl = $('#fps')
let lastFpsT = performance.now()
let frames = 0

// Affinity UI ticker
setInterval(()=>{ const el=document.getElementById('affinityVal'); const bar=document.querySelector('#affinityBar i'); const v=affinity.get(); if(el) el.textContent=v.toFixed(2); if(bar) bar.style.width=(v*100).toFixed(0)+'%'; }, 1000);

// Panel — drawer overlay, collapsed by default (stage-first)
const panelEl = document.querySelector('.panel')
const scrimEl = document.getElementById('scrim')
function isPanelOpen(){ return panelEl && !panelEl.classList.contains('collapsed') }
function syncPanelChrome(){
  const open = isPanelOpen()
  scrimEl?.classList.toggle('show', open)
  document.body.style.overflow = '' // no lock needed — drawer overlays
}
function togglePanel(force){
  if(!panelEl) return
  const open = typeof force === 'boolean' ? force : panelEl.classList.contains('collapsed')
  panelEl.classList.toggle('collapsed', !open)
  syncPanelChrome()
  // persist via settings store (migrates from legacy key)
  try{ setSettings({ panelCollapsed: panelEl.classList.contains('collapsed') }) }catch{}
  if(open) requestAnimationFrame(()=> panelEl.scrollTop = 0)
}
document.getElementById('btnPanel')?.addEventListener('click', ()=> togglePanel())
scrimEl?.addEventListener('click', ()=> togglePanel(false))
// restore preference from settings store — collapsed by default, only open on large window if user left it open
try{
  const wantOpen = !getSettingsRaw().panelCollapsed && innerWidth >= 900
  if(wantOpen) { panelEl.classList.remove('collapsed') }
  syncPanelChrome()
}catch{ syncPanelChrome() }
addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && isPanelOpen()) togglePanel(false)
  if(e.key.toLowerCase()==='p' && (e.ctrlKey||e.metaKey)) { e.preventDefault(); togglePanel() }
})

// Panel tabs — simple nav (Characters / Motion / Scene)
function initPanelTabs(){
  const tabs = document.querySelectorAll('[data-panel-tab]')
  const panels = document.querySelectorAll('.panel-section[data-panel]')
  if(!tabs.length) return
  tabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.dataset.panelTab
      tabs.forEach(b=> b.classList.toggle('active', b===btn))
      panels.forEach(p=> p.classList.toggle('active', p.dataset.panel===target))
      // if backgrounds tab, ensure grid is fresh
      if(target==='scene') renderBgGrid()
    })
  })
}
initPanelTabs()

// Backgrounds picker
let bgListCache = []
let _bgMigrated = false
let _bgInitialApplied = false
async function renderBgGrid(){
  const grid = document.getElementById('bgGrid')
  if(!grid) return
  const cur = getSettingsRaw().backgroundId || 'gradient'
  if(!bgListCache.length){
    grid.innerHTML = `<div class="hint" style="grid-column:1/-1;text-align:center">Loading backgrounds…</div>`
    bgListCache = await fetchBackgrounds()
    // Ensure 3D background actually applies after meta is available (early boot used heuristic)
    if(!_bgInitialApplied && cur !== 'gradient' && cur !== 'solid'){
      _bgInitialApplied = true
      try{ applyBackground(cur, scene) }catch{}
    }
    // auto-default: if user is still on gradient and a 3D room exists, make it the default (one-time migration)
    if(!_bgMigrated && cur === 'gradient'){
      const firstModel = bgListCache.find(b=> b.type==='model')
      if(firstModel){
        try{ if(!localStorage.getItem('waifu:bgAutoDefaultDone')){ _bgMigrated=true; localStorage.setItem('waifu:bgAutoDefaultDone','1'); setBackground(firstModel.id); toast('Background: '+firstModel.name+' (default)'); return } }catch{ _bgMigrated=true; setBackground(firstModel.id); return }
      }
    }
  }
  const builtIns = [
    { id:'gradient', name:'Gradient', thumb:null, label:'Gradient' },
    { id:'solid', name:'Solid dark', thumb:null, label:'Solid' },
  ]
  const all = [...builtIns, ...bgListCache]
  grid.innerHTML = all.map(b=>{
    const isActive = b.id===cur
    if(b.id==='gradient' || b.id==='solid'){
      const bgStyle = b.id==='gradient' ? 'background:#0f172a' : 'background:#020617'
      return `<button class="bg-card ${isActive?'active':''}" data-bg="${b.id}" title="${b.label}"><div style="flex:1;${bgStyle}"></div><span class="bg-label">${b.label}</span></button>`
    }
    const isModel = b.type==='model'
    const safeName = b.name || b.id
    const badge = isModel ? `<span style="position:absolute;top:6px;right:6px;font-size:9px;font-weight:800;letter-spacing:0.08em;padding:2px 6px;border-radius:999px;background:rgba(14,165,233,0.9);color:#fff;line-height:1">3D</span>` : ''
    if(isModel){
      return `<button class="bg-card ${isActive?'active':''}" data-bg="${b.id}" title="${safeName} — 3D model: ${b.ext||'.fbx'}"><div style="flex:1;display:grid;place-items:center;background:#1e293b;font-size:22px">🏠</div><span class="bg-label">${safeName}</span>${badge}</button>`
    }
    const url = b.file || `/backgrounds/${encodeURIComponent(b.id).replace(/%2F/g,'/')}`
    return `<button class="bg-card ${isActive?'active':''}" data-bg="${b.id}" title="${safeName}"><img src="${url}" alt="${safeName}" loading="lazy" onerror="this.style.display='none'"><span class="bg-label">${safeName}</span></button>`
  }).join('')
  // plus add-folder hint card
  grid.insertAdjacentHTML('beforeend', `<div class="bg-card add" title="Add .fbx/.glb models or images to backgrounds/ folder">＋ Add<br><small style="font-weight:500;opacity:0.7">drop .fbx/.glb or images in <code>backgrounds/</code></small></div>`)
  grid.querySelectorAll('[data-bg]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.bg
      setBackground(id)
      renderBgGrid()
      toast(id==='gradient' ? 'Background: Gradient' : id==='solid' ? 'Background: Solid' : 'Background: '+id)
    })
  })
}
renderBgGrid()

// ── Full Debug — Camera + Model + Background (auto-save + Save button) ──
function mountBgDebug(){
  const root = document.getElementById('bgDebug')
  if(!root) return
  let open = false
  let saveTimer = null
  function scheduleAutoSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>{ toast('Auto-saved ✓', 1200) }, 600) }
  function buildOutput(){
    const live = getCamLive()
    const dbg = getCamDebug()
    const mDbg = getModelDebug()
    const mLive = getModelLive()
    const bDbg = getBgDebug()
    const bLive = getBgLiveTransform()
    return `// cam — localStorage waifu:camDebug\n_camDbg = {pos:{x:${dbg.pos.x}, y:${dbg.pos.y}, z:${dbg.pos.z}}, target:{x:${dbg.target.x}, y:${dbg.target.y}, z:${dbg.target.z}}, fov:${dbg.fov}}\n// live cam ${JSON.stringify(live.pos)} → ${JSON.stringify(live.target)} fov ${live.fov}\n// model — waifu:modelDebug\n_modelDbg = {pos:{x:${mDbg.pos.x}, y:${mDbg.pos.y}, z:${mDbg.pos.z}}, rot:{x:${mDbg.rot.x}, y:${mDbg.rot.y}, z:${mDbg.rot.z}}, scale:${mDbg.scale}}\n// live model ${JSON.stringify(mLive.pos)} rot ${JSON.stringify(mLive.rot)} scale ${mLive.scale}\n// bg — waifu:bgDebug\n_bgDbg = {pos:{x:${bDbg.pos.x}, y:${bDbg.pos.y}, z:${bDbg.pos.z}}, rot:{x:${bDbg.rot.x}, y:${bDbg.rot.y}, z:${bDbg.rot.z}}, scale:${bDbg.scale}, groupPos:{x:${bDbg.groupPos.x}, y:${bDbg.groupPos.y}, z:${bDbg.groupPos.z}}, groupRot:{x:${bDbg.groupRot.x}, y:${bDbg.groupRot.y}, z:${bDbg.groupRot.z}}, groupScale:${bDbg.groupScale}}\n// live bg child ${JSON.stringify(bLive.pos)} rot ${JSON.stringify(bLive.rot)} scale ${bLive.scale} | group ${JSON.stringify(bLive.groupPos)} rot ${JSON.stringify(bLive.groupRot)} scale ${bLive.groupScale}`
  }
  function render(){
    const d = getCamDebug()
    const live = getCamLive()
    const b = getBgDebug()
    const bLive = getBgLiveTransform()
    root.innerHTML = `
      <h4>Debug <span style="color:#0ea5e9">FULL</span> <button id="dbgClose" class="btn ghost small" style="padding:2px 6px">✕</button></h4>
      <label class="check" style="margin:0 0 8px;background:${freecamEnabled?'rgba(14,165,233,0.16)':'rgba(148,163,184,0.06)'};border:1px solid ${freecamEnabled?'rgba(14,165,233,0.28)':'var(--line)'}"><input id="chkFreecam" type="checkbox" ${freecamEnabled?'checked':''}> WASD Freecam <span style="margin-left:auto;font-size:10px;opacity:0.8">${freecamEnabled?'ON':'OFF'} — F</span></label>
      <div class="hint" style="margin:0 0 8px"><b>WASD/Q/E</b> move • <b>Shift</b> sprint • <b>Ctrl</b> slow • drag to look • All sliders <b>auto-save</b> to localStorage. Use <b>Save</b> to confirm + copy.</div>

      <div class="dbg-sec" style="padding-top:8px">
        <h5>Camera</h5>
        <div class="dbg-row"><label>Speed</label><input type="range" min="1" max="18" step="0.5" value="${freecamSpeed}" id="freecamSpeed"><input type="number" step="0.5" value="${freecamSpeed}" id="freecamSpeedNum"></div>
        ${['x','y','z'].map(ax=>`<div class="dbg-row"><label>Cam ${ax.toUpperCase()}</label><input type="range" min="-30" max="30" step="0.1" value="${d.pos[ax]}" data-k="pos" data-ax="${ax}"><input type="number" step="0.1" value="${d.pos[ax]}" data-k="pos" data-ax="${ax}"></div>`).join('')}
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Live: ${JSON.stringify(live.pos)} fov ${live.fov}</div>
        ${['x','y','z'].map(ax=>`<div class="dbg-row"><label>Tgt ${ax.toUpperCase()}</label><input type="range" min="-30" max="30" step="0.1" value="${d.target[ax]}" data-k="target" data-ax="${ax}"><input type="number" step="0.1" value="${d.target[ax]}" data-k="target" data-ax="${ax}"></div>`).join('')}
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Live tgt: ${JSON.stringify(live.target)}</div>
        <div class="dbg-row"><label>FOV °</label><input type="range" min="10" max="90" step="0.5" value="${d.fov}" data-k="fov"><input type="number" step="0.5" value="${d.fov}" data-k="fov"></div>
      </div>

      <div class="dbg-sec">
        <h5>Model — pos/rot/scale</h5>
        ${(()=>{ const md=getModelDebug(); return `<div class="dbg-row"><label>Yaw °</label><input type="range" min="-180" max="180" step="1" value="${md.rot.y}" data-mk="rot" data-ax="y"><input type="number" step="1" value="${md.rot.y}" data-mk="rot" data-ax="y"></div><div class="dbg-row"><label>Pitch °</label><input type="range" min="-45" max="45" step="1" value="${md.rot.x}" data-mk="rot" data-ax="x"><input type="number" step="1" value="${md.rot.x}" data-mk="rot" data-ax="x"></div><div class="dbg-row"><label>Roll °</label><input type="range" min="-45" max="45" step="1" value="${md.rot.z}" data-mk="rot" data-ax="z"><input type="number" step="1" value="${md.rot.z}" data-mk="rot" data-ax="z"></div><div class="dbg-row"><label>Pos X</label><input type="range" min="-30" max="30" step="0.1" value="${md.pos.x}" data-mk="pos" data-ax="x"><input type="number" step="0.1" value="${md.pos.x}" data-mk="pos" data-ax="x"></div><div class="dbg-row"><label>Pos Y</label><input type="range" min="-5" max="5" step="0.05" value="${md.pos.y}" data-mk="pos" data-ax="y"><input type="number" step="0.05" value="${md.pos.y}" data-mk="pos" data-ax="y"></div><div class="dbg-row"><label>Pos Z</label><input type="range" min="-30" max="30" step="0.1" value="${md.pos.z}" data-mk="pos" data-ax="z"><input type="number" step="0.1" value="${md.pos.z}" data-mk="pos" data-ax="z"></div><div class="dbg-row"><label>Scale</label><input type="range" min="0.3" max="3" step="0.02" value="${md.scale}" data-mk="scale"><input type="number" step="0.02" value="${md.scale}" data-mk="scale"></div>`})()}
        <div style="font-size:10px;color:var(--muted);margin-top:4px">Live: ${JSON.stringify(getModelLive().pos)} rot ${JSON.stringify(getModelLive().rot)}</div>
      </div>

      <div class="dbg-sec">
        <h5>Background — FBX child</h5>
        ${['x','y','z'].map(ax=>`<div class="dbg-row"><label>BG Pos ${ax.toUpperCase()}</label><input type="range" min="-20" max="20" step="0.1" value="${b.pos[ax]}" data-bk="pos" data-ax="${ax}"><input type="number" step="0.1" value="${b.pos[ax]}" data-bk="pos" data-ax="${ax}"></div>`).join('')}
        ${['x','y','z'].map(ax=>`<div class="dbg-row"><label>BG Rot ${ax.toUpperCase()}°</label><input type="range" min="-180" max="180" step="1" value="${b.rot[ax]}" data-bk="rot" data-ax="${ax}"><input type="number" step="1" value="${b.rot[ax]}" data-bk="rot" data-ax="${ax}"></div>`).join('')}
        <div class="dbg-row"><label>BG Scale</label><input type="range" min="0.1" max="20" step="0.1" value="${b.scale}" data-bk="scale"><input type="number" step="0.1" value="${b.scale}" data-bk="scale"></div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Live child: ${JSON.stringify(bLive.pos)} rot ${JSON.stringify(bLive.rot)} scale ${bLive.scale}</div>
      </div>
      <div class="dbg-sec">
        <h5>Background — Group</h5>
        ${['x','y','z'].map(ax=>`<div class="dbg-row"><label>Grp Pos ${ax.toUpperCase()}</label><input type="range" min="-20" max="20" step="0.1" value="${b.groupPos[ax]}" data-bk="groupPos" data-ax="${ax}"><input type="number" step="0.1" value="${b.groupPos[ax]}" data-bk="groupPos" data-ax="${ax}"></div>`).join('')}
        ${['x','y','z'].map(ax=>`<div class="dbg-row"><label>Grp Rot ${ax.toUpperCase()}°</label><input type="range" min="-180" max="180" step="1" value="${b.groupRot[ax]}" data-bk="groupRot" data-ax="${ax}"><input type="number" step="1" value="${b.groupRot[ax]}" data-bk="groupRot" data-ax="${ax}"></div>`).join('')}
        <div class="dbg-row"><label>Grp Scale</label><input type="range" min="0.1" max="5" step="0.05" value="${b.groupScale}" data-bk="groupScale"><input type="number" step="0.05" value="${b.groupScale}" data-bk="groupScale"></div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">Live grp: ${JSON.stringify(bLive.groupPos)} scale ${bLive.groupScale}</div>
      </div>

      <div class="dbg-actions">
        <button id="dbgSave" class="btn small primary">💾 Save</button>
        <button id="dbgCopy" class="btn small ghost">📋 Copy</button>
        <button id="dbgReset" class="btn small ghost">↺ Reset Cam</button>
        <button id="dbgResetModel" class="btn small ghost">↺ Reset Model</button>
        <button id="dbgResetBg" class="btn small ghost">↺ Reset BG</button>
        <button id="dbgPrint" class="btn small ghost">Log</button>
      </div>
      <div class="dbg-out" id="dbgOut"></div>
      <div class="hint" style="margin-top:8px">Hotkeys: <b>F</b> freecam • <b>Y</b> yaw 0 • <b>Ctrl+Shift+D</b> panel • All changes auto-save. Save = persist + copy.</div>
    `
    const out = root.querySelector('#dbgOut')
    if(out) out.textContent = buildOutput()
    root.querySelectorAll('input[data-k]').forEach(inp=>{
      const k=inp.dataset.k, ax=inp.dataset.ax
      inp.addEventListener('input', ()=>{
        const v=parseFloat(inp.value)
        root.querySelectorAll(`input[data-k="${k}"]${ax?`[data-ax="${ax}"]`:''}`).forEach(sib=>{ if(sib!==inp) sib.value=inp.value })
        if(ax) setCamDebugTransform({[k]:{[ax]:v}}); else setCamDebugTransform({[k]:v})
        if(out) out.textContent=buildOutput()
        scheduleAutoSave()
      })
    })
    root.querySelectorAll('input[data-mk]').forEach(inp=>{
      const k=inp.dataset.mk, ax=inp.dataset.ax
      inp.addEventListener('input', ()=>{
        const v=parseFloat(inp.value)
        root.querySelectorAll(`input[data-mk="${k}"]${ax?`[data-ax="${ax}"]`:''}`).forEach(sib=>{ if(sib!==inp) sib.value=inp.value })
        if(ax) setModelDebugTransform({[k]:{[ax]:v}}); else setModelDebugTransform({[k]:v})
        if(out) out.textContent=buildOutput()
        scheduleAutoSave()
      })
    })
    root.querySelectorAll('input[data-bk]').forEach(inp=>{
      const k=inp.dataset.bk, ax=inp.dataset.ax
      inp.addEventListener('input', ()=>{
        const v=parseFloat(inp.value)
        root.querySelectorAll(`input[data-bk="${k}"]${ax?`[data-ax="${ax}"]`:''}`).forEach(sib=>{ if(sib!==inp) sib.value=inp.value })
        if(ax) setBgDebugTransform({[k]:{[ax]:v}}); else setBgDebugTransform({[k]:v})
        if(out) out.textContent=buildOutput()
        scheduleAutoSave()
      })
    })
    root.querySelector('#chkFreecam')?.addEventListener('change', e=> setFreecamEnabled(e.target.checked))
    const sp=root.querySelector('#freecamSpeed'), spNum=root.querySelector('#freecamSpeedNum')
    const syncSpeed=v=>{ freecamSpeed=parseFloat(v)||6; try{localStorage.setItem('waifu:freecamSpeed', String(freecamSpeed))}catch{}; if(sp&&sp!==document.activeElement) sp.value=freecamSpeed; if(spNum&&spNum!==document.activeElement) spNum.value=freecamSpeed }
    sp?.addEventListener('input', ()=>{ syncSpeed(sp.value); if(spNum) spNum.value=sp.value; scheduleAutoSave() })
    spNum?.addEventListener('input', ()=>{ syncSpeed(spNum.value); if(sp) sp.value=spNum.value; scheduleAutoSave() })
    root.querySelector('#dbgClose')?.addEventListener('click', close)
    root.querySelector('#dbgSave')?.addEventListener('click', async ()=>{
      // explicit save: re-persist all (already auto) + copy + toast
      try{ localStorage.setItem('waifu:freecamSpeed', String(freecamSpeed)) }catch{}
      const txt=buildOutput()
      try{ await navigator.clipboard.writeText(txt) }catch{ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove() }
      console.log('[debug save]\n'+txt)
      toast('Saved ✓ — copied to clipboard', 2600)
    })
    root.querySelector('#dbgCopy')?.addEventListener('click', async ()=>{ const txt=buildOutput(); try{ await navigator.clipboard.writeText(txt); toast('Copied ✓') }catch{ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied ✓')} console.log(txt) })
    root.querySelector('#dbgReset')?.addEventListener('click', ()=>{ resetCamDebug(); toast('Cam reset'); render() })
    root.querySelector('#dbgResetModel')?.addEventListener('click', ()=>{ resetModelDebug(); toast('Model reset'); render() })
    root.querySelector('#dbgResetBg')?.addEventListener('click', ()=>{ resetBgDebug(); toast('BG reset'); render() })
    root.querySelector('#dbgPrint')?.addEventListener('click', ()=>{ const txt=buildOutput(); console.log(txt); toast('Logged (F12)') })
  }
  function openDbg(){ open=true; root.classList.remove('hidden'); render() }
  function close(){ open=false; root.classList.add('hidden') }
  function toggle(){ if(open) close(); else openDbg() }
  window.bgDebug={ open:openDbg, close, toggle, get:getCamDebug, set:setCamDebugTransform, reset:resetCamDebug, live:getCamLive }
  window.camDebug=window.bgDebug
  window.modelDebug._panelToggle = toggle
  try{ const b=document.getElementById('btnBgDebug'); if(b) b.textContent='🛠 Debug (full)' }catch{}
  document.getElementById('btnBgDebug')?.addEventListener('click', openDbg)
  addEventListener('keydown', e=>{ if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key.toLowerCase()==='d'||e.key.toLowerCase()==='c')){ e.preventDefault(); toggle() } })
  setInterval(()=>{ if(!open||root.classList.contains('hidden')) return; const out=root.querySelector('#dbgOut'); if(out) out.textContent=buildOutput() }, 800)
}
mountBgDebug()
// live update via HMR
if(import.meta.hot){
  import.meta.hot.on('backgrounds:update', async ()=>{
    bgListCache = await fetchBackgrounds()
    renderBgGrid()
  })
} else {
  // polling fallback every 6s while dev
  setInterval(async ()=>{
    const fresh = await fetchBackgrounds()
    if(fresh.length!==bgListCache.length || fresh.map(x=>x.id).join(',')!==bgListCache.map(x=>x.id).join(',')){
      bgListCache = fresh
      renderBgGrid()
    }
  }, 6000)
}

// Main Menu — gate before character screen
let menuDismissed = sessionStorage.getItem('waifu:menuDismissed') === '1'
let bootStarted = false
let bootPromise = null
function showMainMenu(){
  const el = document.getElementById('mainMenu')
  if(!el) return
  el.classList.remove('hidden')
  const hint = document.getElementById('menuHint')
  const enterBtn = document.getElementById('btnMenuEnter')
  const s = getSettingsRaw()
  if(!s.onboarded){
    if(hint) hint.textContent = 'First time — hit Setup to add API keys, or Enter to try offline mock.'
    if(enterBtn) enterBtn.textContent = '▶ Enter (offline mock)'
  } else {
    const bgLabel = s.backgroundId==='gradient'?'gradient': s.backgroundId==='solid'?'solid' : (bgListCache.find(b=>b.id===s.backgroundId)?.type==='model'?'3D room': 'image')
    if(hint) hint.textContent = `Ready as ${s.modelId} • ${bgLabel} background • ${bgListCache.length} background${bgListCache.length===1?'':'s'} in backgrounds/`
    if(enterBtn) enterBtn.textContent = '▶ Enter Stage'
  }
}
function hideMainMenu(){
  const el = document.getElementById('mainMenu')
  if(el) el.classList.add('hidden')
  menuDismissed = true
  try{ sessionStorage.setItem('waifu:menuDismissed','1') }catch{}
}
async function enterStage(){
  hideMainMenu()
  if(!bootStarted){
    bootStarted = true
    bootPromise = bootApp()
  } else if(bootPromise){
    await bootPromise
  }
  // ensure camera focused
  focusCamera()
}
function initMainMenu(){
  document.getElementById('btnMenuEnter')?.addEventListener('click', enterStage)
  document.getElementById('btnMenuSkip')?.addEventListener('click', (e)=>{ e.preventDefault(); enterStage() })
  document.getElementById('btnMenuSetup')?.addEventListener('click', ()=>{
    hideMainMenu()
    // show wizard (will re-show menu on close if not entered?)
    setupWizard?.open()
    // after wizard closes, if still not booted, enter
    const origClose = setupWizard?.close
    // hook finish: when wizard finishes, enter stage
    // Instead, listen via onFinish already handles toast; we just wait then enter
    // Let user manually hit Enter after setup, but auto-enter after 400ms if they closed wizard
    setTimeout(()=>{ if(!bootStarted) showMainMenu() }, 500)
  })
  document.getElementById('btnMenuSettings')?.addEventListener('click', ()=>{
    hideMainMenu()
    settingsModal?.open()
  })
  document.getElementById('btnMenuBackgrounds')?.addEventListener('click', ()=>{
    hideMainMenu()
    // open panel on scene tab
    if(panelEl.classList.contains('collapsed')) togglePanel(true)
    document.querySelector('[data-panel-tab="scene"]')?.click()
    if(!bootStarted){ bootStarted=true; bootPromise=bootApp() }
  })
  // logo click reopens menu
  document.querySelector('.logo')?.addEventListener('click', ()=>{
    if(menuDismissed) showMainMenu()
  })
  // initial show if not dismissed
  if(!menuDismissed) showMainMenu()
  else {
    // if dismissed this session but page reloaded via hard nav, still show once per session
    // we already hid, so auto-boot
    bootStarted = true
    bootPromise = bootApp()
  }
}

// Resize — dynamic resolution (debounced + DPR-aware)
let _resizeT = null
let _lastDpr = window.devicePixelRatio
function onDynamicResize(){
  clearTimeout(_resizeT)
  _resizeT = setTimeout(()=> applyRendererSize(), 70)
}
addEventListener('resize', onDynamicResize)
try{
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  const dprCheck = () => {
    if(window.devicePixelRatio !== _lastDpr){ _lastDpr = window.devicePixelRatio; applyRendererSize() }
  }
  mq.addEventListener?.('change', dprCheck)
  setInterval(dprCheck, 1500)
}catch{}
try{
  const ro = new ResizeObserver(()=> onDynamicResize())
  ro.observe(document.documentElement)
}catch{}

// Render loop — throttled when tab hidden to fix "not responding" spam
let lastFrame = performance.now()
function animate(){
  requestAnimationFrame(animate)
  if(document.hidden) return
  const tNow = performance.now()
  const cap = getSettingsRaw().fpsCap || 0
  if(cap===30 && tNow - lastFrame < 32) return
  if(cap===60 && tNow - lastFrame < 15) return
  if(cap===0 && tNow - lastFrame < 11) { /* ~90fps */ }
  lastFrame = tNow
  let dt = clock.getDelta()
  dt = Math.min(dt, 0.033)

  if(helper){
    try{ helper.update(dt) }catch(e){ /* physics warmup */ }
  }
  // face light tracks head bone (face-forward, not N·L) — keeps face lit in profile
  if(headBone && faceLight && mmdMesh){
    try{
      const headPos = new THREE.Vector3(); headBone.getWorldPosition(headPos)
      const headQuat = new THREE.Quaternion(); headBone.getWorldQuaternion(headQuat)
      const fwd = new THREE.Vector3(0,0,1).applyQuaternion(headQuat)
      if(fwd.lengthSq() < 0.05) fwd.set(0,0,1).applyQuaternion(mmdMesh.quaternion)
      fwd.normalize()
      const lightPos = headPos.clone().addScaledVector(fwd, 7).add(new THREE.Vector3(0,1.0,0))
      faceLight.position.copy(lightPos)
      faceLight.target.position.copy(headPos)
      faceLight.target.updateMatrixWorld()
      // subtle backlit boost
      const keyDir = new THREE.Vector3().copy(keyLight.position).sub(keyLight.target.position).normalize()
      const backlit = fwd.dot(keyDir) < -0.20 ? 1 : 0
      faceLight.intensity = 0.55 + backlit*0.20
    }catch{}
  }

  // morph driver: sample viseme from audio clock (or perf if no audio)
  if(morphDriver && waifu) {
    const ctxTime = waifu.audioCtx ? waifu.audioCtx.currentTime : performance.now()/1000
    const viseme = waifu.sampleViseme ? waifu.sampleViseme(ctxTime) : null
    morphDriver.tick(dt, ctxTime, viseme)
  } else if(morphDriver) {
    morphDriver.tick(dt, performance.now()/1000, null)
  }

  if(freecamEnabled && !params.autoRotate && !isTyping()){
    const base=freecamSpeed*(freecamKeys.shift?2.6:1)*(freecamKeys.ctrl?0.28:1)
    const mv=base*Math.min(dt*60,2)*0.12
    const fwd=new THREE.Vector3(); camera.getWorldDirection(fwd)
    const right=new THREE.Vector3().crossVectors(fwd,camera.up).normalize()
    const up=new THREE.Vector3(0,1,0)
    const delta=new THREE.Vector3()
    if(freecamKeys.w) delta.addScaledVector(fwd, mv)
    if(freecamKeys.s) delta.addScaledVector(fwd, -mv)
    if(freecamKeys.a) delta.addScaledVector(right, -mv)
    if(freecamKeys.d) delta.addScaledVector(right, mv)
    if(freecamKeys.space||freecamKeys.e) delta.addScaledVector(up, mv)
    if(freecamKeys.q) delta.addScaledVector(up, -mv)
    if(delta.lengthSq()>1e-9){
      camera.position.add(delta); controls.target.add(delta)
      const np={x:+camera.position.x.toFixed(3),y:+camera.position.y.toFixed(3),z:+camera.position.z.toFixed(3)}
      const nt={x:+controls.target.x.toFixed(3),y:+controls.target.y.toFixed(3),z:+controls.target.z.toFixed(3)}
      setCamDebugTransform({pos:np, target:nt})
    }
  }
  if(params.autoRotate){
    const t = performance.now()*0.00012
    const r = 22
    camera.position.x = Math.cos(t)*r
    camera.position.z = Math.sin(t)*r
    camera.lookAt(0,9,0)
  } else {
    controls.update()
  }

  renderer.render(scene, camera)

  frames++
  const now = performance.now()
  if(now - lastFpsT > 500){
    const fps = Math.round(frames*1000/(now-lastFpsT))
    fpsEl.textContent = fps + ' fps'
    frames = 0
    lastFpsT = now
  }
}
animate()

// Live VMD folder sync — HMR + polling fallback
async function refreshVmdLive(){
  const prevId = params.animId
  const prevLen = ANIMATIONS.length
  await fetchVmdList()
  // if current selection was removed, fall back to none
  if(!ANIMATIONS.find(a=> a.id===prevId)){
    params.animId = 'none'
    // if a model is loaded, switch to static pose
    if(mmdMesh) await loadAnimationForCurrentModel()
  }
  buildAnimList()
  if(ANIMATIONS.length !== prevLen){
    const vmdN = ANIMATIONS.length - 1
    setStatus(`VMD folder: ${vmdN} file${vmdN===1?'':'s'}`, '')
    toast(`VMD list updated — ${vmdN} file${vmdN===1?'':'s'}`)
  }
}

if(import.meta.hot){
  import.meta.hot.on('vmd:update', async ()=>{
    await refreshVmdLive()
  })
}
// Fallback polling every 4s while dev server is running — cheap and catches external copies even if watcher misses
let vmdPollId = setInterval(refreshVmdLive, 4000)
// pause polling when tab hidden to save work
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){ clearInterval(vmdPollId); vmdPollId=null }
  else if(!vmdPollId){ vmdPollId = setInterval(refreshVmdLive, 4000); refreshVmdLive() }
})

// Boot — gated behind main menu
async function bootApp(){
  try{
    setLoader(true, 'Preparing…', 5, 'Three.js + Bullet')
    await fetchVmdList()
    buildAnimList()
    renderBgGrid()
    initWaifuBridge()
    await new Promise(r=>setTimeout(r, 120))
    {
      const base = getModelById(params.modelId) || MODELS[0]
      const resolved = { ...base, file: resolveModelFile(params.modelId, currentOutfitId()) }
      await loadModel(resolved)
    }
  }catch(e){
    console.error(e)
    setStatus('Boot failed: ' + (e?.message||e), 'err')
    setLoader(true, 'Boot failed', 100, String(e?.message||e))
  }
}
// start menu (gates boot)
initMainMenu()

// Drag & drop support for custom VMD/PMX (also auto-adds dropped VMD to the live list in-memory)
addEventListener('dragover', e=>{ e.preventDefault() })
addEventListener('drop', async e=>{
  e.preventDefault()
  const files = [...e.dataTransfer.files]
  const vmd = files.find(f=> f.name.toLowerCase().endsWith('.vmd'))
  if(vmd && mmdMesh){
    setLoader(true, 'Loading dropped VMD…', 30, vmd.name)
    const url = URL.createObjectURL(vmd)
    try{
      hardResetPoseAndPhysics()
      const clip = await new Promise((res, rej)=>{
        loader.loadAnimation(url, mmdMesh, res, undefined, rej)
      })
      helper.add(mmdMesh, { animation: clip, physics: params.physics, gravity: new THREE.Vector3(0, parseFloat($('#gravity').value),0), unitStep: PHYSICS_DEFAULTS.unitStep, maxStepNum: PHYSICS_DEFAULTS.maxStepNum })
      try{ helper.objects.get(mmdMesh).physics?.warmup(30) }catch{}
      helper.enable('physics', params.physics)
      helper.enable('ik', params.ik)
      const obj = helper.objects.get(mmdMesh)
      if(obj?.mixer){
        obj.mixer.timeScale = params.speed
        obj.mixer._actions?.forEach(a=> a.reset().play())
      }
      try{ _applyModelDbg() }catch{ mmdMesh.scale.x = params.mirror ? -1 : 1 }
      currentVmd = clip
      setLoader(false)
      setStatus('Playing • ' + vmd.name)
      toast('Loaded dropped VMD: ' + vmd.name)
      // add to in-memory list so it appears as selectable; live sync will pick it up if user saves it to VMD_Animations/
      const dropId = 'drop_' + Date.now()
      ANIMATIONS.push({ id: dropId, name: vmd.name.replace(/\.vmd$/i,''), file: url, desc:'dropped • drag to VMD_Animations/ to keep' })
      params.animId = dropId
      buildAnimList()
    }catch(err){
      console.error(err)
      setLoader(false)
      toast('VMD drop failed', 3000)
      try{ helper.add(mmdMesh, { physics: params.physics, animation: undefined, gravity: new THREE.Vector3(0, parseFloat($('#gravity').value),0), unitStep: PHYSICS_DEFAULTS.unitStep, maxStepNum: PHYSICS_DEFAULTS.maxStepNum }) }catch{}
    }
  }
})
