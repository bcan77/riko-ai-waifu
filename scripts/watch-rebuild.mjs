#!/usr/bin/env node
// Watch source files and auto-rebuild when they change.
// Watches: waifu-viewer/src, backend/app, backgrounds, characters, VERSION, version.json
// Debounced rebuild via `npm run build` (vite) — skips if already building.

import fs from 'node:fs'
import path from 'node:path'
import { spawn, execSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const DEBOUNCE_MS = 1200
const WATCH = [
  path.join(ROOT, 'waifu-viewer/src'),
  path.join(ROOT, 'waifu-viewer/index.html'),
  path.join(ROOT, 'waifu-viewer/vite.config.js'),
  path.join(ROOT, 'waifu-viewer/public'),
  path.join(ROOT, 'backend/app'),
  path.join(ROOT, 'backgrounds'),
  path.join(ROOT, 'characters'),
  path.join(ROOT, 'VERSION'),
  path.join(ROOT, 'version.json'),
]

let building = false
let queued = false
let timer = null
let watcherCount = 0

function log(msg){ console.log(`[watch-rebuild ${new Date().toLocaleTimeString()}] ${msg}`) }

function needsRebuild(){
  // simple: if any watched file mtime > dist mtime, needs rebuild
  const dist = path.join(ROOT, 'waifu-viewer/dist')
  const vjson = path.join(ROOT, 'version.json')
  if(!fs.existsSync(dist)) return true
  try{
    const distMtime = fs.statSync(dist).mtimeMs
    const vjsonMtime = fs.existsSync(vjson) ? fs.statSync(vjson).mtimeMs : 0
    const newest = Math.max(distMtime, vjsonMtime)
    for(const w of WATCH){
      if(!fs.existsSync(w)) continue
      const stat = fs.statSync(w)
      if(stat.isFile()){
        if(stat.mtimeMs > newest + 500) return true
      } else {
        // walk dir, check newest file
        const walk=(dir)=>{
          for(const e of fs.readdirSync(dir,{withFileTypes:true})){
            const p = path.join(dir, e.name)
            if(e.isDirectory()){
              if(e.name==='node_modules' || e.name==='.git' || e.name==='dist') continue
              if(walk(p)) return true
            } else {
              if(fs.statSync(p).mtimeMs > newest + 500) return true
            }
          }
          return false
        }
        if(walk(w)) return true
      }
    }
  }catch{}
  return false
}

function runBuild(){
  if(building){ queued=true; return }
  building=true
  log('changes detected — rebuilding…')
  // bump version.json buildTime so clients see new build
  try{ execSync('node scripts/version.mjs sync', {cwd: ROOT, stdio:'inherit'}) }catch{}
  const child = spawn('npm', ['run','build'], { cwd: ROOT, stdio:'inherit', shell: false })
  child.on('close', (code)=>{
    building=false
    if(code===0) log(`build done ✓  (version ${fs.readFileSync(path.join(ROOT,'VERSION'),'utf8').trim()})`)
    else log(`build failed with code ${code}`)
    if(queued){
      queued=false
      // if more changes arrived while building, rebuild again
      setTimeout(()=> runBuild(), 400)
    } else {
      // touch version.json to update buildTime for polling clients
      try{ execSync('node scripts/version.mjs sync', {cwd: ROOT, stdio:'ignore'}) }catch{}
    }
  })
  child.on('error', (e)=>{
    building=false
    log(`spawn error: ${e.message}`)
  })
}

function schedule(){
  clearTimeout(timer)
  timer = setTimeout(()=>{
    if(needsRebuild()) runBuild()
    else log('change but dist already fresh — skipping rebuild')
  }, DEBOUNCE_MS)
}

// setup watchers using fs.watch (recursive where available)
for(const p of WATCH){
  if(!fs.existsSync(p)) continue
  try{
    const stat = fs.statSync(p)
    if(stat.isDirectory()){
      // use recursive watch if available (Linux may not support, fallback to polling not needed — vite watcher already covers dev)
      fs.watch(p, { recursive: true }, (ev, filename)=>{
        // ignore noisy temp files
        if(!filename) { schedule(); return }
        const low = filename.toLowerCase()
        if(low.endsWith('.tmp') || low.endsWith('~') || low.includes('node_modules')) return
        log(`changed: ${filename} (${ev})`)
        schedule()
      })
      watcherCount++
    } else {
      fs.watch(p, (ev)=>{ log(`changed: ${path.basename(p)} (${ev})`); schedule() })
      watcherCount++
    }
  }catch(e){
    log(`cannot watch ${p}: ${e.message}`)
  }
}

log(`watching ${watcherCount} path(s) for changes — will auto-run \`npm run build\` when needed`)
log(`tip: bump version with \`node scripts/version.mjs bump [patch|minor|major]\``)

// also do initial stale check
if(needsRebuild()){
  log('dist is stale vs source on startup — building now…')
  runBuild()
} else {
  log('dist is fresh — waiting for edits…')
}

// keep alive
process.on('SIGINT', ()=>{ log('stopping watcher'); process.exit(0) })
