/**
 * cloud-view.js — Neural Cloud full-screen realm.
 * Mesh-network animated backdrop + node graph where every uploaded file
 * is a draggable node. Click a node to inspect (preview/describe/delete).
 */
import { t } from './i18n.js'

const SVGNS = 'http://www.w3.org/2000/svg'
const KIND_CLASS = { image: 'k-image', text: 'k-text', pdf: 'k-pdf' }
const KIND_ICON = { image: '🖼', text: '📄', pdf: '📕' }
const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.markdown,.csv,.json,.log,.pdf'

let root = null, canvas = null, svg = null, panel = null
let fileInput = null, uploadBtn = null, hintEl = null
let gView = null, gLinks = null, gNodes = null
let toastFn = (m) => {}
let files = []
let nodes = new Map() // id -> {id, meta, x, y, phase, spawn}
let selectedId = null
let view = { x: 0, y: 0, k: 1 }
let mesh = []
let mouse = { x: -9999, y: -9999 }
let W = 0, H = 0, DPR = 1
let t0 = performance.now()
let reduceMotion = false
try{ reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches }catch{}

function el(tag, attrs, parent){
  const e = document.createElementNS(SVGNS, tag)
  for(const k in attrs) e.setAttribute(k, attrs[k])
  if(parent) parent.appendChild(e)
  return e
}

function isActive(){
  try{ return document.body.dataset.screen === 'cloud' && !document.hidden }catch{ return false }
}

function resize(){
  if(!root) return
  const r = root.getBoundingClientRect()
  W = Math.max(50, r.width); H = Math.max(50, r.height)
  DPR = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = W * DPR; canvas.height = H * DPR
  const ctx = canvas.getContext('2d')
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
  seedMesh()
}

function seedMesh(){
  const n = Math.max(30, Math.min(95, Math.floor(W * H / 16000)))
  mesh = Array.from({ length: n }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    r: 1 + Math.random() * 1.8,
  }))
}

function drawMesh(ctx){
  ctx.clearRect(0, 0, W, H)
  const R = 130
  ctx.lineWidth = 1
  for(const p of mesh){
    p.x += p.vx; p.y += p.vy
    if(p.x < 0 || p.x > W) p.vx *= -1
    if(p.y < 0 || p.y > H) p.vy *= -1
    // gentle mouse repel
    const dx = p.x - mouse.x, dy = p.y - mouse.y
    const d2 = dx * dx + dy * dy
    if(d2 < 120 * 120 && d2 > 1){
      const d = Math.sqrt(d2)
      p.x += (dx / d) * 0.6; p.y += (dy / d) * 0.6
    }
  }
  for(let i = 0; i < mesh.length; i++){
    for(let j = i + 1; j < mesh.length; j++){
      const a = mesh[i], b = mesh[j]
      const dx = a.x - b.x, dy = a.y - b.y
      const d = Math.hypot(dx, dy)
      if(d < R){
        ctx.strokeStyle = `rgba(56,189,248,${(0.22 * (1 - d / R)).toFixed(3)})`
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
    }
  }
  for(const p of mesh){
    ctx.fillStyle = 'rgba(125,211,252,0.7)'
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill()
  }
}

function spiralPos(i){
  const ang = i * 2.399963 + 0.6
  const rad = 200 + 64 * Math.sqrt(i)
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * 0.82 }
}

function shortName(name, max = 14){
  const base = (name || '').replace(/\.[^.]+$/, '')
  return base.length > max ? base.slice(0, max - 1) + '…' : base
}

function buildNode(n){
  const g = el('g', { class: `cnode ${KIND_CLASS[n.meta.kind] || 'k-text'}`, 'data-id': n.id }, gNodes)
  el('circle', { class: 'halo', r: 34 }, g)
  const core = el('circle', { class: 'core', r: 26 }, g)
  core.style.color = '';
  el('text', { class: 'cicon', y: 5 }, g).textContent = KIND_ICON[n.meta.kind] || '📄'
  el('text', { y: 44 }, g).textContent = shortName(n.meta.name)
  const sub = el('text', { class: 'csub', y: 57 }, g)
  sub.textContent = n.meta.kind === 'image'
    ? (n.meta.description ? t('cloud.described') : t('cloud.nodesc'))
    : `${Math.max(1, Math.round((n.meta.size || 0) / 1024))} KB`
  n.el = g; n.subEl = sub
  bindNodeDrag(g, n)
}

function refreshNodeMeta(n){
  if(!n.el) return
  n.el.setAttribute('class', `cnode ${KIND_CLASS[n.meta.kind] || 'k-text'}${selectedId === n.id ? ' selected' : ''}`)
  if(n.subEl) n.subEl.textContent = n.meta.kind === 'image'
    ? (n.meta.description ? t('cloud.described') : t('cloud.nodesc'))
    : `${Math.max(1, Math.round((n.meta.size || 0) / 1024))} KB`
}

function bindNodeDrag(g, n){
  let dragging = false, moved = 0, lx = 0, ly = 0
  g.addEventListener('pointerdown', (e)=>{
    dragging = true; moved = 0; lx = e.clientX; ly = e.clientY
    g.setPointerCapture(e.pointerId)
    e.stopPropagation()
  })
  g.addEventListener('pointermove', (e)=>{
    if(!dragging) return
    const dx = e.clientX - lx, dy = e.clientY - ly
    moved += Math.abs(dx) + Math.abs(dy)
    lx = e.clientX; ly = e.clientY
    if(moved > 3){
      n.x += dx / view.k; n.y += dy / view.k
    }
  })
  g.addEventListener('pointerup', (e)=>{
    dragging = false
    if(moved <= 4) select(n.id === selectedId ? null : n.id)
  })
}

function render(now){
  requestAnimationFrame(render)
  if(!isActive() || !root) return
  const ctx = canvas.getContext('2d')
  const t = (now - t0) / 1000
  if(!reduceMotion || !render._painted){
    drawMesh(ctx)
    render._painted = true
  }
  // viewport
  gView.setAttribute('transform', `translate(${W / 2 + view.x},${H / 2 + view.y}) scale(${view.k})`)
  // core link anchor at world origin
  const list = [...nodes.values()]
  // links (skip the pinned core self-link)
  while(gLinks.firstChild) gLinks.removeChild(gLinks.firstChild)
  for(const n of list){
    if(n.core) continue
    const fl = reduceMotion ? 0 : Math.sin(t * 0.7 + n.phase) * 7
    el('line', { class: 'clink', x1: 0, y1: 0, x2: n.x, y2: n.y + fl }, gLinks)
  }
  // nodes (+ spawn pop)
  for(const n of list){
    if(!n.el) buildNode(n)
    const fl = reduceMotion ? 0 : Math.sin(t * 0.7 + n.phase) * 7
    const age = (now - n.spawn) / 1000
    const s = reduceMotion ? 1 : Math.min(1, age * 2.5)
    const ease = 1 - Math.pow(1 - s, 3)
    n.el.setAttribute('transform', `translate(${n.x},${n.y + fl}) scale(${ease.toFixed(3)})`)
  }
  // core pulse
  const core = gNodes.querySelector('[data-id="__core__"] circle.halo')
  if(core) core.setAttribute('r', 34 + (reduceMotion ? 0 : Math.sin(t * 1.4) * 3))
}

export async function refreshCloudView(){
  if(!root) return
  try{
    const r = await fetch('/api/cloud/files', { cache: 'no-store' })
    if(!r.ok) return
    files = (await r.json()).files || []
  }catch{ return }
  const seen = new Set()
  files.forEach((m, i)=>{
    seen.add(m.id)
    let n = nodes.get(m.id)
    if(!n){
      const p = spiralPos(i)
      n = { id: m.id, meta: m, x: p.x, y: p.y, phase: Math.random() * 6.28, spawn: performance.now(), el: null }
      nodes.set(m.id, n)
    } else {
      n.meta = m
      refreshNodeMeta(n)
    }
  })
  for(const [id, n] of nodes){
    if(id !== '__core__' && !seen.has(id)){
      n.el?.remove()
      nodes.delete(id)
      if(selectedId === id) select(null)
    }
  }
  if(hintEl) hintEl.textContent = files.length ? t('cv.hint') : t('cv.empty')
  const sub = document.getElementById('cloudSub')
  if(sub) sub.textContent = t('cv.sub')
  const up = document.getElementById('btnCloudUpload')
  if(up) up.textContent = t('cv.upload')
  const back = document.getElementById('btnCloudBack')
  if(back) back.textContent = t('cv.back')
}

function esc(s){ return String(s ?? '').replace(/</g, '&lt;') }

function trackMouse(cx, cy){
  const r = (typeof svg !== 'undefined' && svg) ? svg.getBoundingClientRect() : { left: 0, top: 0 }
  mouse.x = cx - r.left; mouse.y = cy - r.top
}

async function uploadFiles(list){
  const f = list?.[0]
  if(!f) return
  const btn = document.getElementById('btnCloudUpload')
  const orig = btn ? btn.textContent : ''
  if(btn){ btn.disabled = true; btn.textContent = t('cv.uploading') }
  try{
    const fd = new FormData()
    fd.append('file', f)
    const r = await fetch('/api/cloud/upload', { method: 'POST', body: fd })
    const j = await r.json().catch(() => ({}))
    if(!r.ok) throw new Error(j.detail || ('api ' + r.status))
    toastFn(t('cv.nodeAdded') + (j.file?.vision?.model ? ` (${j.file.vision.model})` : ''))
    await refreshCloudView()
    if(j.file?.id) select(j.file.id)
  }catch(e){ toastFn(t('ext.failed', { e: e?.message || e })) }
  if(btn){ btn.disabled = false; btn.textContent = orig || t('cv.upload') }
}

async function select(id){
  selectedId = id
  for(const n of nodes.values()) refreshNodeMeta(n)
  const coreEl = gNodes.querySelector('[data-id="__core__"]')
  if(coreEl) coreEl.setAttribute('class', `cnode k-core${!id ? ' selected' : ''}`)
  if(!id || !panel){ if(panel) panel.classList.add('hidden'); return }
  const n = nodes.get(id)
  if(!n || !n.meta){ panel.classList.add('hidden'); return }
  const m = n.meta
  panel.classList.remove('hidden')
  panel.innerHTML = `<div class="cp-kind">${m.kind} • ${new Date(m.created * 1000).toLocaleDateString()}</div>
    <h3>${esc(m.name)}</h3>
    <div class="cp-meta">${t('cv.idLabel')}: <code>${m.id}</code></div>
    <div id="cpBody"><div class="settings-hint" style="margin:8px 0">…</div></div>
    <div class="row">
      ${m.kind === 'image' ? `<button class="btn small ghost" data-cp="redesc">👁 ${t('cv.redescribeShort')}</button>` : ''}
      <a class="btn small ghost" style="text-decoration:none" href="/api/cloud/files/${m.id}" download="${esc(m.name)}">${t('cv.openOrig')}</a>
      <button class="btn small ghost" data-cp="del">✕ ${t('cv.delete')}</button>
      <button class="btn small" data-cp="close">${t('cv.close')}</button>
    </div>`
  const body = panel.querySelector('#cpBody')
  try{
    if(m.kind === 'image'){
      body.innerHTML = `<img src="/api/cloud/files/${m.id}" alt="${esc(m.name)}">` +
        (m.description ? `<pre>${esc(m.description.slice(0, 900))}</pre>` : `<div class="settings-hint" style="margin:8px 0">${t('cloud.nodesc')}</div>`)
    } else {
      const r = await fetch(`/api/cloud/files/${m.id}/text?limit=1500`, { cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      body.innerHTML = `<pre>${esc((j.text || '').slice(0, 900)) || '…'}</pre>`
    }
  }catch{ body.innerHTML = '' }
  panel.querySelector('[data-cp="close"]')?.addEventListener('click', ()=> select(null))
  panel.querySelector('[data-cp="del"]')?.addEventListener('click', async ()=>{
    try{
      const r = await fetch('/api/cloud/files/' + encodeURIComponent(m.id), { method: 'DELETE' })
      if(!r.ok) throw new Error('api ' + r.status)
      toastFn(t('cv.deleted'))
      await refreshCloudView()
    }catch(e){ toastFn(t('ext.failed', { e: e?.message || e })) }
  })
  const rd = panel.querySelector('[data-cp="redesc"]')
  rd?.addEventListener('click', async ()=>{
    rd.disabled = true; rd.textContent = '…'
    try{
      const r = await fetch('/api/cloud/files/' + encodeURIComponent(m.id) + '/describe', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' })
      const j = await r.json().catch(() => ({}))
      if(!r.ok) throw new Error(j.detail || ('api ' + r.status))
      toastFn(t('cloud.describedToast', { m: j.model || 'vision' }))
      await refreshCloudView()
      select(m.id)
    }catch(e){ toastFn(t('ext.failed', { e: e?.message || e })); rd.disabled = false }
  })
}

function buildCore(){
  const g = el('g', { class: 'cnode k-core selected', 'data-id': '__core__' }, gNodes)
  el('circle', { class: 'halo', r: 34 }, g)
  el('circle', { class: 'core', r: 26 }, g)
  el('text', { class: 'cicon', y: 7 }, g).textContent = '☁'
  const n = { id: '__core__', meta: null, x: 0, y: 0, phase: 0, spawn: 0, el: g, core: true }
  nodes.set('__core__', n)
  // core is pinned — click only, never drags
  g.addEventListener('pointerdown', (e)=> e.stopPropagation())
  g.addEventListener('click', (e)=>{ e.stopPropagation(); select(null) })
}

export function initCloudView(opts = {}){
  toastFn = opts.toast || toastFn
  root = document.getElementById('cloudView')
  if(!root) return
  canvas = document.getElementById('cloudMesh')
  svg = document.getElementById('cloudGraph')
  panel = document.getElementById('cloudPanel')
  fileInput = document.getElementById('cloudViewFile')
  uploadBtn = document.getElementById('btnCloudUpload')
  hintEl = document.getElementById('cloudHint')
  if(fileInput) fileInput.setAttribute('accept', ACCEPT)
  gView = el('g', { id: 'cvView' }, svg)
  gLinks = el('g', { id: 'cvLinks' }, gView)
  gNodes = el('g', { id: 'cvNodes' }, gView)
  buildCore()

  // pan on background
  let panning = false, sx = 0, sy = 0
  svg.addEventListener('pointerdown', (e)=>{
    if(e.target !== svg) return
    panning = true; sx = e.clientX; sy = e.clientY
    svg.setPointerCapture(e.pointerId)
    select(null)
  })
  svg.addEventListener('pointermove', (e)=>{
    trackMouse(e.clientX, e.clientY)
    if(!panning) return
    view.x += e.clientX - sx; view.y += e.clientY - sy
    sx = e.clientX; sy = e.clientY
  })
  const stopPan = ()=>{ panning = false }
  svg.addEventListener('pointerup', stopPan)
  svg.addEventListener('pointercancel', stopPan)
  svg.addEventListener('pointerleave', ()=>{ mouse.x = -9999; mouse.y = -9999 })
  svg.addEventListener('wheel', (e)=>{
    e.preventDefault()
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1
    view.k = Math.min(2.5, Math.max(0.4, view.k * f))
  }, { passive: false })

  canvas.addEventListener('pointermove', (e)=>{
    trackMouse(e.clientX, e.clientY)
  })

  uploadBtn?.addEventListener('click', ()=> fileInput?.click())
  document.getElementById('btnCloudBack')?.addEventListener('click', ()=>{
    if(window.__setScreen) window.__setScreen('dashboard')
    else document.getElementById('btnDash')?.click()
  })
  fileInput?.addEventListener('change', async ()=>{
    const f = fileInput.files?.[0]
    fileInput.value = ''
    await uploadFiles(f ? [f] : [])
  })
  // drag & drop anywhere on the realm
  let dropDepth = 0
  root.addEventListener('dragenter', (e)=>{ e.preventDefault(); dropDepth++; root.classList.add('dropping') })
  root.addEventListener('dragover', (e)=>{ e.preventDefault() })
  root.addEventListener('dragleave', (e)=>{ e.preventDefault(); dropDepth = Math.max(0, dropDepth - 1); if(!dropDepth) root.classList.remove('dropping') })
  root.addEventListener('drop', async (e)=>{
    e.preventDefault(); e.stopPropagation()
    dropDepth = 0; root.classList.remove('dropping')
    await uploadFiles([...(e.dataTransfer?.files || [])])
  })

  try{ new ResizeObserver(resize).observe(root) }catch{}
  resize()
  refreshCloudView()
  requestAnimationFrame(render)
  window.__cloudRefresh = refreshCloudView
}
