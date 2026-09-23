/**
 * benchmark.js — one-click PC capability test.
 * Grades CPU / GPU / RAM / TTS / 3D-background support and maps the result
 * to recommended quality settings. Used by the setup wizard + Settings.
 */
import * as THREE from 'three'
import { set as setSettings } from '../settings/store.js'
import { t } from './i18n.js'

export const BENCH_TIERS = {
  excellent: { label: 'Excellent', desc: 'Full quality — 3D rooms, shadows, high DPR', cls: 'ok' },
  good:      { label: 'Good',      desc: 'Balanced — 3D rooms on, shadows 1024', cls: 'ok' },
  basic:     { label: 'Basic',     desc: 'Light mode — capped DPR, 30fps, faster TTS fallback', cls: 'warn' },
}

const RECOMMENDED = {
  excellent: { dprCap: 'auto', shadowRes: 'auto', shadows: true, fpsCap: 0, ground: true },
  good:      { dprCap: '1.5', shadowRes: '1024', shadows: true, fpsCap: 0, ground: true },
  basic:     { dprCap: '1.25', shadowRes: '1024', shadows: true, fpsCap: 30, ground: true },
}

function cpuProbe(){
  const t0 = performance.now()
  let acc = 0
  for(let i = 0; i < 3000000; i++) acc += Math.sin(i * 0.0001) * Math.cos(i * 0.0002)
  return { ms: performance.now() - t0, acc }
}

async function gpuProbe(onProgress){
  // hidden 640x360 stress scene — 1200 tumbling boxes, 150 frames timed
  const canvas = document.createElement('canvas')
  canvas.width = 640; canvas.height = 360
  canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;height:360px;pointer-events:none'
  document.body.appendChild(canvas)
  let renderer = null
  try{
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    renderer.setSize(640, 360, false)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, 640 / 360, 0.1, 100)
    camera.position.z = 18
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
    const mat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 })
    const group = new THREE.Group()
    for(let i = 0; i < 1200; i++){
      const m = new THREE.Mesh(geo, mat)
      m.position.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10)
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0)
      group.add(m)
    }
    scene.add(group)
    // warmup
    for(let i = 0; i < 10; i++) renderer.render(scene, camera)
    const FRAMES = 150
    const t0 = performance.now()
    for(let f = 0; f < FRAMES; f++){
      group.rotation.y += 0.02
      group.rotation.x += 0.007
      renderer.render(scene, camera)
      if(f % 30 === 0){ onProgress?.(0.15 + (f / FRAMES) * 0.55); await new Promise(r => setTimeout(r, 0)) }
    }
    const secs = (performance.now() - t0) / 1000
    const info = renderer.info
    return { fps: FRAMES / Math.max(secs, 0.01), webgl2: renderer.capabilities.isWebGL2, maxTex: renderer.capabilities.maxTextureSize, drawCalls: info?.render?.calls ?? 0 }
  } finally {
    try{ renderer?.dispose() }catch{}
    canvas.remove()
  }
}

async function backendProbe(){
  try{
    const r = await fetch('/health', { cache: 'no-store' })
    if(!r.ok) return { ok: false }
    const h = await r.json()
    return {
      ok: !!h.ok,
      llm: h.llm_provider || 'mock',
      tts: h.tts_provider || 'mock',
      hasKeys: !!(h.has_openrouter || h.has_groq),
    }
  }catch{ return { ok: false } }
}

export async function runBenchmark(onProgress){
  onProgress?.(0.03, 'CPU test…')
  await new Promise(r => setTimeout(r, 30))
  const cpu = cpuProbe()
  const cores = navigator.hardwareConcurrency || 4
  const ramGB = navigator.deviceMemory || 0 // 0 = unknown

  onProgress?.(0.12, 'GPU stress test…')
  const gpu = await gpuProbe(onProgress)

  onProgress?.(0.72, 'TTS + backend…')
  const [backend, ttsLocal] = await Promise.all([
    backendProbe(),
    Promise.resolve(!!(window.speechSynthesis || window.SpeechRecognition || window.webkitSpeechRecognition)),
  ])

  // 3D backgrounds need WebGL2 + decent texture budget
  const bg3d = gpu.webgl2 && gpu.maxTex >= 4096

  // composite score 0..100
  let score = 0
  score += cpu.ms < 120 ? 30 : cpu.ms < 300 ? 20 : 10
  score += gpu.fps >= 55 ? 40 : gpu.fps >= 30 ? 28 : gpu.fps >= 18 ? 15 : 5
  score += ramGB >= 8 ? 15 : ramGB >= 4 ? 10 : ramGB === 0 ? 8 : 5
  score += cores >= 8 ? 15 : cores >= 4 ? 10 : 5
  const tier = score >= 75 ? 'excellent' : score >= 50 ? 'good' : 'basic'

  onProgress?.(1, 'Done')
  return {
    tier,
    score: Math.round(score),
    date: new Date().toISOString(),
    cpu: { ms: Math.round(cpu.ms), cores },
    gpu: { fps: Math.round(gpu.fps), webgl2: gpu.webgl2, maxTex: gpu.maxTex },
    ramGB,
    tts: { local: ttsLocal, provider: backend.tts || 'mock' },
    backend,
    bg3d,
    recommended: { ...RECOMMENDED[tier] },
  }
}

export function applyRecommended(result){
  if(!result?.recommended) return null
  setSettings({
    ...result.recommended,
    benchmarkTier: result.tier,
    benchmarkDate: result.date,
  })
  return result.recommended
}

export function describeResult(r){
  if(!r) return []
  const rows = []
  rows.push({ label: 'CPU', value: t('bench.cpu', { ms: r.cpu.ms, n: r.cpu.cores }), status: r.cpu.ms < 300 ? 'ok' : 'warn' })
  rows.push({ label: 'GPU', value: t('bench.gpu', { fps: r.gpu.fps, webgl: r.gpu.webgl2 ? ' • WebGL2' : ' • WebGL1' }), status: r.gpu.fps >= 30 ? 'ok' : r.gpu.fps >= 18 ? 'warn' : 'bad' })
  rows.push({ label: 'RAM', value: r.ramGB ? `${r.ramGB} GB` : t('bench.ramUnknown'), status: !r.ramGB || r.ramGB >= 4 ? 'ok' : 'warn' })
  rows.push({ label: t('bench.rooms'), value: r.bg3d ? t('bench.bgOk') : t('bench.bgLimit'), status: r.bg3d ? 'ok' : 'warn' })
  rows.push({ label: 'TTS', value: `${r.tts.provider}${r.tts.local ? t('bench.localVoice') : ''}`, status: 'ok' })
  rows.push({ label: 'Backend', value: r.backend.ok ? `${r.backend.llm} • ${r.backend.hasKeys ? t('bench.keysSet') : t('bench.keysMissing')}` : t('bench.backendOff'), status: r.backend.ok ? 'ok' : 'warn' })
  return rows
}
