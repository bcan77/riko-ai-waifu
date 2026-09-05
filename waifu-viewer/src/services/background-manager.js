import * as THREE from 'three'
import { get as getSettings, getRaw, set as setSettings } from '../settings/store.js'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

let bgTexture = null
let bgSphere = null
let sceneRef = null
let bgGroup = null          // THREE.Group for 3D background models
let bgModelCache = new Map() // modelFile -> THREE.Group clone source
let curModelKey = null
let groundRefs = null
let cameraRef = null
let controlsRef = null

// ── Debug defaults (baked final values, but now editable + auto-saved) ──
const DEFAULT_BG = { pos:{x:15,y:-0.9,z:2.7}, rot:{x:0,y:0,z:0}, scale:10, groupPos:{x:0,y:0,z:0}, groupRot:{x:0,y:0,z:0}, groupScale:1 }
let _bgDbg = (()=>{ try{ const j=JSON.parse(localStorage.getItem('waifu:bgDebug')||'null'); if(j&&typeof j==='object'&&j.pos) return { pos:{...DEFAULT_BG.pos, ...(j.pos||{})}, rot:{...DEFAULT_BG.rot, ...(j.rot||{})}, scale: (typeof j.scale==='number'?j.scale:DEFAULT_BG.scale), groupPos:{...DEFAULT_BG.groupPos, ...(j.groupPos||{})}, groupRot:{...DEFAULT_BG.groupRot, ...(j.groupRot||{})}, groupScale:(typeof j.groupScale==='number'?j.groupScale:DEFAULT_BG.groupScale) } }catch{} return { pos:{...DEFAULT_BG.pos}, rot:{...DEFAULT_BG.rot}, scale:DEFAULT_BG.scale, groupPos:{...DEFAULT_BG.groupPos}, groupRot:{...DEFAULT_BG.groupRot}, groupScale:DEFAULT_BG.groupScale } })()
function _saveBgDbg(){ try{ localStorage.setItem('waifu:bgDebug', JSON.stringify(_bgDbg)) }catch{} }
// keep PERM_BG alias for legacy inspect
const PERM_BG = DEFAULT_BG

const DEFAULT_CAM = { pos:{x:-47.625, y:18.212, z:12.266}, target:{x:-20.48, y:15.605, z:5.917}, fov:38 }
let _camDbg = (()=>{ try{ const j=JSON.parse(localStorage.getItem('waifu:camDebug')||'null'); if(j&&typeof j==='object'&&j.pos&&j.target) return { pos:{...DEFAULT_CAM.pos, ...(j.pos||{})}, target:{...DEFAULT_CAM.target, ...(j.target||{})}, fov:(typeof j.fov==='number'?j.fov:DEFAULT_CAM.fov) } }catch{} return { pos:{...DEFAULT_CAM.pos}, target:{...DEFAULT_CAM.target}, fov:DEFAULT_CAM.fov } })()
function _saveCamDbg(){ try{ localStorage.setItem('waifu:camDebug', JSON.stringify(_camDbg)) }catch{} }

export function getBgGroup(){ return bgGroup }
export function getCamDebug(){ return JSON.parse(JSON.stringify(_camDbg)) }
export function getCamLive(){
  if(!cameraRef || !controlsRef) return { pos:{x:0,y:0,z:0}, target:{x:0,y:0,z:0}, fov:38, dbg:JSON.parse(JSON.stringify(_camDbg)) }
  const p = cameraRef.position, t = controlsRef.target
  return {
    pos:{x:+p.x.toFixed(3), y:+p.y.toFixed(3), z:+p.z.toFixed(3)},
    target:{x:+t.x.toFixed(3), y:+t.y.toFixed(3), z:+t.z.toFixed(3)},
    fov: +(cameraRef.fov?.toFixed ? cameraRef.fov.toFixed(2) : 38),
    dbg:JSON.parse(JSON.stringify(_camDbg))
  }
}
function _applyCamToScene(){
  if(!cameraRef || !controlsRef) return
  cameraRef.position.set(_camDbg.pos.x, _camDbg.pos.y, _camDbg.pos.z)
  controlsRef.target.set(_camDbg.target.x, _camDbg.target.y, _camDbg.target.z)
  if(typeof _camDbg.fov === 'number' && cameraRef.fov !== undefined){
    cameraRef.fov = _camDbg.fov
    cameraRef.updateProjectionMatrix()
  }
  controlsRef.update()
}
export function setCamDebugTransform(patch){
  if(!patch) return
  if(patch.pos) Object.assign(_camDbg.pos, patch.pos)
  if(patch.target) Object.assign(_camDbg.target, patch.target)
  if(typeof patch.fov==='number') _camDbg.fov = patch.fov
  _saveCamDbg()
  _applyCamToScene()
}
export function resetCamDebug(){ _camDbg = { pos:{...DEFAULT_CAM.pos}, target:{...DEFAULT_CAM.target}, fov:DEFAULT_CAM.fov }; _saveCamDbg(); _applyCamToScene() }
// BG debug — live transform of FBX child + group
export function getBgDebug(){ return JSON.parse(JSON.stringify(_bgDbg)) }
export function getBgLiveTransform(){
  if(!bgGroup) return { pos:{x:0,y:0,z:0}, rot:{x:0,y:0,z:0}, scale:1, groupPos:{x:0,y:0,z:0}, groupRot:{x:0,y:0,z:0}, groupScale:1, dbg:JSON.parse(JSON.stringify(_bgDbg)) }
  const child = bgGroup.children[0] || null
  const p = child ? child.position : {x:0,y:0,z:0}
  const s = child ? child.scale.x : 1
  const r = child ? child.rotation : {x:0,y:0,z:0}
  return {
    pos:{x:+p.x.toFixed(3), y:+p.y.toFixed(3), z:+p.z.toFixed(3)},
    rot:{x:+(THREE.MathUtils.radToDeg(r.x).toFixed(2)), y:+(THREE.MathUtils.radToDeg(r.y).toFixed(2)), z:+(THREE.MathUtils.radToDeg(r.z).toFixed(2))},
    scale:+s.toFixed(4),
    groupPos:{x:+bgGroup.position.x.toFixed(3), y:+bgGroup.position.y.toFixed(3), z:+bgGroup.position.z.toFixed(3)},
    groupRot:{x:+(THREE.MathUtils.radToDeg(bgGroup.rotation.x).toFixed(2)), y:+(THREE.MathUtils.radToDeg(bgGroup.rotation.y).toFixed(2)), z:+(THREE.MathUtils.radToDeg(bgGroup.rotation.z).toFixed(2))},
    groupScale:+bgGroup.scale.x.toFixed(4),
    dbg:JSON.parse(JSON.stringify(_bgDbg))
  }
}
function _applyBgDbgLive(){
  if(!bgGroup) return
  const child = bgGroup.children[0]
  if(child && child.userData?._baseFit){
    const b = child.userData._baseFit
    child.position.set(b.pos.x + _bgDbg.pos.x, b.pos.y + _bgDbg.pos.y, b.pos.z + _bgDbg.pos.z)
    child.rotation.set(THREE.MathUtils.degToRad(_bgDbg.rot.x), THREE.MathUtils.degToRad(_bgDbg.rot.y), THREE.MathUtils.degToRad(_bgDbg.rot.z))
    child.scale.setScalar(b.scale * (_bgDbg.scale||1))
  }
  bgGroup.position.set(_bgDbg.groupPos.x, _bgDbg.groupPos.y, _bgDbg.groupPos.z)
  bgGroup.rotation.set(THREE.MathUtils.degToRad(_bgDbg.groupRot.x), THREE.MathUtils.degToRad(_bgDbg.groupRot.y), THREE.MathUtils.degToRad(_bgDbg.groupRot.z))
  bgGroup.scale.setScalar(_bgDbg.groupScale||1)
}
export function setBgDebugTransform(patch){
  if(!patch) return
  if(patch.pos) Object.assign(_bgDbg.pos, patch.pos)
  if(patch.rot) Object.assign(_bgDbg.rot, patch.rot)
  if(typeof patch.scale==='number') _bgDbg.scale = patch.scale
  if(patch.groupPos) Object.assign(_bgDbg.groupPos, patch.groupPos)
  if(patch.groupRot) Object.assign(_bgDbg.groupRot, patch.groupRot)
  if(typeof patch.groupScale==='number') _bgDbg.groupScale = patch.groupScale
  _saveBgDbg()
  _applyBgDbgLive()
}
export function resetBgDebug(){ _bgDbg = { pos:{...DEFAULT_BG.pos}, rot:{...DEFAULT_BG.rot}, scale:DEFAULT_BG.scale, groupPos:{...DEFAULT_BG.groupPos}, groupRot:{...DEFAULT_BG.groupRot}, groupScale:DEFAULT_BG.groupScale }; _saveBgDbg(); _applyBgDbgLive() }
const loadingManager = new THREE.LoadingManager()
// FBX files reference textures as "2.fbm/NormalMap.png" (Windows .fbm folder) but
// our project stores them under Cozy-Living-Room/textures/. Rewrite those URLs.
try{
  loadingManager.setURLModifier((url)=>{
    // url may be like "/backgrounds/Cozy-Living-Room/source/2.fbm/NormalMap.png"
    // or "2.fbm/NormalMap.png" relative
    if(url.includes('.fbm')){
      const fname = url.split('/').pop().split('\\').pop()
      if(fname) return `/backgrounds/Cozy-Living-Room/textures/${fname.split('/').map(encodeURIComponent).join('/')}`
    }
    return url
  })
}catch{}
const loader = new THREE.TextureLoader(loadingManager)
const fbxLoader = new FBXLoader(loadingManager)
const gltfLoader = new GLTFLoader(loadingManager)
const objLoader = new OBJLoader(loadingManager)

export function registerBackgroundSphere(mesh){
  bgSphere = mesh
}
export function registerBackgroundGroup(group){
  bgGroup = group
}
export function registerGround(refs){
  groundRefs = refs
}
export function registerCamera(camera, controls){
  cameraRef = camera
  controlsRef = controls
  try{ _applyCamToScene() }catch{}
  try{
    controls.addEventListener('end', ()=>{
      _camDbg.pos.x = +camera.position.x.toFixed(3)
      _camDbg.pos.y = +camera.position.y.toFixed(3)
      _camDbg.pos.z = +camera.position.z.toFixed(3)
      _camDbg.target.x = +controls.target.x.toFixed(3)
      _camDbg.target.y = +controls.target.y.toFixed(3)
      _camDbg.target.z = +controls.target.z.toFixed(3)
      if(typeof camera.fov === 'number') _camDbg.fov = +camera.fov.toFixed(2)
      _saveCamDbg()
    })
  }catch{}
}
function setGroundVisible(v){
  if(!groundRefs) return
  if(groundRefs.mesh) groundRefs.mesh.visible = v
  if(groundRefs.grid) groundRefs.grid.visible = v
  if(groundRefs.line) groundRefs.line.visible = v
}
function ensureBgGroup(scene){
  if(bgGroup) return bgGroup
  bgGroup = new THREE.Group()
  bgGroup.name = 'BackgroundModelGroup'
  bgGroup.visible = false
  if(scene) scene.add(bgGroup)
  else if(sceneRef) sceneRef.add(bgGroup)
  return bgGroup
}
function toast(msg){
  try{
    const t=document.getElementById('toast')
    if(t){ t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2600) }
  }catch{}
  console.log('[bg]', msg)
}
function clearBgGroup(){
  if(!bgGroup) return
  for(const c of [...bgGroup.children]){
    bgGroup.remove(c)
    c.traverse?.(o=>{
      if(o.isMesh){
        o.geometry?.dispose?.()
        if(o.material){
          const mats = Array.isArray(o.material)? o.material : [o.material]
          for(const m of mats){
            m.map?.dispose?.()
            // don't dispose shared textures aggressively
            m.dispose?.()
          }
        }
      }
    })
  }
  bgGroup.visible = false
  curModelKey = null
}

function fitAndPlaceModel(root){
  // compute original bounds
  const box0 = new THREE.Box3().setFromObject(root)
  if(box0.isEmpty()){
    console.warn('[bg] empty bounds, skipping fit')
    return
  }
  const size0 = box0.getSize(new THREE.Vector3())
  const center0 = box0.getCenter(new THREE.Vector3())
  console.log('[bg] original box size', size0, 'center', center0)

  // auto-scale to fit ~ 24 units wide/deep/height (room scale)
  const maxDim = Math.max(size0.x, size0.y, size0.z)
  const target = 24
  let s = 1
  if(maxDim > 0.01){
    s = target / maxDim
    // allow wide range: 0.001 .. 10 (small models need big up-scale, huge need down-scale)
    s = Math.max(0.001, Math.min(10, s))
    root.scale.setScalar(s)
    console.log('[bg] scale', s.toFixed(4), 'maxDim', maxDim.toFixed(2), 'target', target)
  }

  // re-compute center after scale for accurate placement
  // instead of recomputing full box (cost), just scale original center/size
  // center scaled = center0 * s ? No, center0 is world pos of object; after scaling around origin, the center shifts? Simpler: reset position then compute new box
  root.position.set(0,0,0)
  // center: we want model centered at origin horizontally
  // use scaled box to compute offset
  const boxScaled = new THREE.Box3().setFromObject(root)
  const centerScaled = boxScaled.getCenter(new THREE.Vector3())
  const sizeScaled = boxScaled.getSize(new THREE.Vector3())
  console.log('[bg] scaled box size', sizeScaled, 'center', centerScaled)
  // move so scaled center is at origin, then lift so floor at y=-0.5
  root.position.sub(centerScaled)
  // floor should be slightly below character feet (y=0). Put bottom at -0.5
  // bottom is -sizeScaled.y/2 after centering, so shift up by sizeScaled.y/2 -0.5
  root.position.y += sizeScaled.y/2 - 0.5
  console.log('[bg] placed at', root.position, 'scaled size', sizeScaled)

  // fix materials — villa walls/floor need soft diffuse, not GMod plastic
  root.traverse(o=>{
    if(o.isMesh){
      o.castShadow = false
      o.receiveShadow = true
      if(o.material){
        const mats = Array.isArray(o.material)? o.material:[o.material]
        for(const m of mats){
          m.side = THREE.DoubleSide
          if(m.transparent && m.opacity < 0.08) { m.transparent=false; m.opacity=1 }
          // tame FBX specular/roughness for cozy interior: matte walls, soft floor
          if('roughness' in m && typeof m.roughness==='number'){ m.roughness = Math.max(0.72, Math.min(1, m.roughness||0.85)) }
          if('metalness' in m && typeof m.metalness==='number'){ m.metalness = Math.min(0.08, m.metalness) }
          if(m.emissive){ m.emissive.setHex(0x000000); m.emissiveIntensity = 0 }
          if(m.map) m.map.colorSpace = THREE.SRGBColorSpace
          m.needsUpdate = true
        }
      }
    }
  })
  root.userData = root.userData || {}
  root.userData._baseFit = { pos:{x:root.position.x, y:root.position.y, z:root.position.z}, scale: root.scale.x, rot:{x:0,y:0,z:0} }
  root.position.set(root.userData._baseFit.pos.x + _bgDbg.pos.x, root.userData._baseFit.pos.y + _bgDbg.pos.y, root.userData._baseFit.pos.z + _bgDbg.pos.z)
  root.rotation.set(THREE.MathUtils.degToRad(_bgDbg.rot.x), THREE.MathUtils.degToRad(_bgDbg.rot.y), THREE.MathUtils.degToRad(_bgDbg.rot.z))
  root.scale.setScalar(root.userData._baseFit.scale * (_bgDbg.scale||1))
  if(bgGroup){
    bgGroup.position.set(_bgDbg.groupPos.x, _bgDbg.groupPos.y, _bgDbg.groupPos.z)
    bgGroup.rotation.set(THREE.MathUtils.degToRad(_bgDbg.groupRot.x), THREE.MathUtils.degToRad(_bgDbg.groupRot.y), THREE.MathUtils.degToRad(_bgDbg.groupRot.z))
    bgGroup.scale.setScalar(_bgDbg.groupScale||1)
  }
  root.userData._permApplied = { ..._bgDbg }
}

function frameCameraForRoom(){
  if(!cameraRef || !controlsRef || !bgGroup) return
  try{ _applyCamToScene(); }catch(e){ console.warn('[bg] frameCamera failed', e) }
  try{
    controlsRef.minDistance = 2
    controlsRef.maxDistance = 28
    controlsRef.maxPolarAngle = Math.PI * 0.485
    controlsRef.update()
  }catch{}
}
function frameCameraForImageOrGradient(){
  if(!cameraRef || !controlsRef) return
  try{
    // image/gradient uses a neutral framing but keeps fov from baked cam
    cameraRef.position.set(0, 12.2, 16)
    controlsRef.target.set(0, 8.8, 0)
    // keep baked fov/target distance style
    controlsRef.minDistance = 3
    controlsRef.maxDistance = 70
    controlsRef.maxPolarAngle = Math.PI * 0.49
    controlsRef.update()
  }catch{}
}

function loadModelFile(modelFile, onDone, onErr){
  const ext = modelFile.split('.').pop()?.toLowerCase() || ''
  const url = `/backgrounds/${modelFile.split('/').map(encodeURIComponent).join('/')}`
  console.log('[bg] loading', url, 'ext', ext)
  if(bgModelCache.has(modelFile)){
    const cached = bgModelCache.get(modelFile)
    console.log('[bg] cache hit', modelFile)
    onDone(cached.clone(true))
    return
  }
  toast(`Loading 3D background…`)
  if(ext === 'fbx'){
    // Ensure texture base path is correct so relative loads resolve to model folder first,
    // then our LoadingManager URL modifier rewrites .fbm -> textures/
    const basePath = `/backgrounds/${modelFile.split('/').slice(0,-1).map(encodeURIComponent).join('/')}/`
    try{ fbxLoader.setResourcePath(basePath); fbxLoader.setPath(basePath) }catch{}
    fbxLoader.load(url, (obj)=>{
      console.log('[bg] FBX loaded, children', obj.children.length)
      fitAndPlaceModel(obj)
      bgModelCache.set(modelFile, obj.clone(true))
      onDone(obj)
    }, (ev)=>{
      if(ev && ev.loaded && ev.total) console.log('[bg] FBX progress', (ev.loaded/ev.total*100).toFixed(0)+'%')
    }, (err)=>{
      console.error('[bg] FBX load error', err)
      onErr(err)
    })
  } else if(ext === 'glb' || ext === 'gltf'){
    gltfLoader.load(url, (gltf)=>{
      const obj = gltf.scene || gltf.scenes?.[0]
      if(!obj){ onErr(new Error('empty gltf')); return }
      console.log('[bg] GLTF loaded')
      fitAndPlaceModel(obj)
      bgModelCache.set(modelFile, obj.clone(true))
      onDone(obj)
    }, undefined, onErr)
  } else if(ext === 'obj'){
    objLoader.load(url, (obj)=>{
      fitAndPlaceModel(obj)
      bgModelCache.set(modelFile, obj.clone(true))
      onDone(obj)
    }, undefined, onErr)
  } else {
    onErr(new Error('unsupported model ext: '+ext))
  }
}

let bgMetaCache = [] // last fetch list to resolve type

export function setBgMeta(list){ bgMetaCache = Array.isArray(list)? list: [] }

function resolveBgEntry(id){
  if(!id) return null
  if(id==='gradient' || id==='solid') return { id, type: id }
  let e = bgMetaCache.find(x=> x.id===id)
  if(e) return e
  // Heuristic for early-boot before fetch: known model folder ids (e.g. Cozy-Living-Room)
  // should resolve as model even without ext so early apply doesn't mis-classify as image.
  const knownModelIds = new Set(['Cozy-Living-Room'])
  if(knownModelIds.has(id)){
    return { id, type:'model', modelFile: `${id}/source/на скетч в2.fbx`, ext: '.fbx', file: `/backgrounds/${id}/source/${encodeURIComponent('на скетч в2.fbx')}` , name: id }
  }
  const ext = id.split('.').pop()?.toLowerCase()
  if(['fbx','glb','gltf','obj','pmx','pmd'].includes(ext)) return { id, type:'model', modelFile: id, ext: '.'+ext, file: `/backgrounds/${id}` }
  return { id, type:'image', file: `/backgrounds/${id}` }
}

export function applyBackground(id, scene){
  if(scene) sceneRef = scene
  const s = sceneRef || scene
  if(!s) return
  const target = sceneRef || s
  const group = ensureBgGroup(target)
  const bgId = id || getRaw().backgroundId || 'gradient'
  const entry = resolveBgEntry(bgId)
  console.log('[bg] apply', bgId, entry)

  if(entry.type==='gradient' || entry.id==='gradient'){
    clearBgGroup()
    target.background = new THREE.Color(0x04070f)
    if(bgSphere) bgSphere.visible = true
    if(bgTexture){ try{bgTexture.dispose()}catch{}; bgTexture=null }
    setGroundVisible(true)
    frameCameraForImageOrGradient()
    return
  }
  if(entry.type==='solid' || entry.id==='solid'){
    clearBgGroup()
    target.background = new THREE.Color(0x020617)
    if(bgSphere) bgSphere.visible = false
    if(bgTexture){ try{bgTexture.dispose()}catch{}; bgTexture=null }
    setGroundVisible(true)
    frameCameraForImageOrGradient()
    return
  }

  if(entry.type==='model'){
    if(bgSphere) bgSphere.visible = false
    setGroundVisible(false)
    if(bgTexture){ try{bgTexture.dispose()}catch{}; bgTexture=null; target.background = new THREE.Color(0x020617) }
    else target.background = new THREE.Color(0x020617)
    const modelFile = entry.modelFile || entry.file?.replace('/backgrounds/','') || entry.id
    if(curModelKey === modelFile && group.visible && group.children.length){
      console.log('[bg] already showing', modelFile)
      return
    }
    clearBgGroup()
    group.visible = false
    curModelKey = modelFile
    loadModelFile(modelFile, (obj)=>{
      if((getRaw().backgroundId||'gradient') !== bgId){
        console.log('[bg] background changed while loading, discarding', bgId)
        return
      }
      clearBgGroup()
      curModelKey = modelFile
      group.add(obj)
      group.visible = true
      console.log('[bg] model added to scene, visible', group.visible, 'children', group.children.length)
      frameCameraForRoom()
      toast(`Background: ${entry.name||modelFile} ✓`)
    }, (err)=>{
      console.error('[bg] model load failed', modelFile, err?.message||err)
      toast(`Background failed to load (${modelFile})`)
      if((getRaw().backgroundId||'gradient') === bgId){
        target.background = new THREE.Color(0x04070f)
        if(bgSphere) bgSphere.visible = true
      }
      clearBgGroup()
      setGroundVisible(true)
      frameCameraForImageOrGradient()
    })
    return
  }

  // image
  clearBgGroup()
  if(bgSphere) bgSphere.visible = false
  setGroundVisible(true)
  frameCameraForImageOrGradient()
  const url = entry.file || `/backgrounds/${bgId.split('/').map(encodeURIComponent).join('/')}`
  if(bgTexture && bgTexture.userData?.__bgId === bgId){
    target.background = bgTexture
    return
  }
  if(bgTexture){ try{ bgTexture.dispose()}catch{}; bgTexture=null }
  target.background = new THREE.Color(0x020617)
  loader.load(url, (tex)=>{
    tex.colorSpace = THREE.SRGBColorSpace
    tex.userData = { __bgId: bgId }
    bgTexture = tex
    if((getRaw().backgroundId||'gradient') === bgId){
      target.background = tex
    }
  }, undefined, ()=>{
    target.background = new THREE.Color(0x04070f)
    if(bgSphere) bgSphere.visible = true
  })
}

export async function fetchBackgrounds(){
  // Try canonical, alias, and direct Vite-style endpoints — the Vite proxy
  // is intentionally selective (does NOT proxy /api/backgrounds) so this
  // request is served locally by backgroundsLiveSync even when the backend
  // is down. The fallbacks cover the Electron/dist case.
  const urls = ['/api/backgrounds', '/api/backgrounds/list', '/backgrounds.json']
  for(const url of urls){
    try{
      const r = await fetch(url, { cache:'no-store' })
      if(!r.ok) continue
      const list = await r.json()
      const arr = Array.isArray(list) ? list : []
      if(!arr.length && url !== urls[urls.length-1]) continue
      setBgMeta(arr)
      console.log('[bg] fetched', arr, 'from', url)
      return arr
    }catch(e){ /* try next */ }
  }
  console.warn('[bg] fetch failed — all endpoints unreachable')
  return []
}

export function setBackground(id){
  setSettings({ backgroundId: id })
  applyBackground(id, sceneRef)
}
