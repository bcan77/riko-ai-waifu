#!/usr/bin/env node
// Version manager — single source of truth: ./VERSION + ./version.json
// Format: Continent-VersionNumber-Revision  e.g. EU-0.3.7-02
//   continent: 2-3 uppercase letters (EU, NA, AS, etc.) — default EU
//   version:   semver major.minor.patch
//   revision:  2-digit zero-padded revision (01..99)
// Usage:
//   node scripts/version.mjs              # print current version info
//   node scripts/version.mjs bump         # bump revision (EU-0.3.7-02 -> EU-0.3.7-03)
//   node scripts/version.mjs bump patch   # EU-0.3.7-02 -> EU-0.3.8-01
//   node scripts/version.mjs bump minor   # EU-0.3.7-02 -> EU-0.4.0-01
//   node scripts/version.mjs bump major   # EU-0.3.7-02 -> EU-1.0.0-01
//   node scripts/version.mjs bump continent NA  # EU-0.3.7-02 -> NA-0.3.7-02
//   node scripts/version.mjs sync         # regenerate version.json only
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const VERSION_FILE = path.join(ROOT, 'VERSION')
const JSON_FILE = path.join(ROOT, 'version.json')
const PUBLIC_JSON = path.join(ROOT, 'waifu-viewer/public/version.json')

function readVersion() {
  try { return fs.readFileSync(VERSION_FILE, 'utf8').trim() || 'EU-0.0.1-01' } catch { return 'EU-0.0.1-01' }
}
function writeVersion(v) { fs.writeFileSync(VERSION_FILE, v.trim() + '\n') }

function parse(v){
  v = v.trim()
  // new format: EU-0.3.7-02
  let m = v.match(/^([A-Z]{2,3})-(\d+)\.(\d+)\.(\d+)-(\d+)$/)
  if(m) return { continent: m[1], major:+m[2], minor:+m[3], patch:+m[4], revision:+m[5], legacy:false }
  // legacy semver: 0.2.1 or 0.2.1-foo
  m = v.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/)
  if(m) return { continent:'EU', major:+m[1], minor:+m[2], patch:+m[3], revision:1, legacy:true, suffix:m[4] }
  // bare fallback
  return { continent:'EU', major:0, minor:0, patch:1, revision:1, legacy:false }
}
function format(p){
  const rev = String(p.revision).padStart(2,'0')
  return `${p.continent}-${p.major}.${p.minor}.${p.patch}-${rev}`
}
function npmVersion(p){
  // package.json must be valid semver — use versionNumber only
  return `${p.major}.${p.minor}.${p.patch}`
}

function bump(v, kind='revision', extra) {
  const p = parse(v)
  // normalize legacy to new format on first bump
  if(p.legacy && kind!=='continent'){
    // treat legacy patch as raw version, keep its numbers
    // kind will apply on top of converted p
  }
  if(kind==='continent'){
    const code = (extra||'EU').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3) || 'EU'
    p.continent = code
    return format(p)
  }
  if(kind==='revision'){
    p.revision = (p.revision||0) + 1
    if(p.revision>99) p.revision=99
  } else if(kind==='patch'){
    p.patch += 1
    p.revision = 1
  } else if(kind==='minor'){
    p.minor += 1
    p.patch = 0
    p.revision = 1
  } else if(kind==='major'){
    p.major += 1
    p.minor = 0
    p.patch = 0
    p.revision = 1
  } else {
    // unknown -> revision
    p.revision += 1
  }
  return format(p)
}

function gitInfo() {
  let commit = 'unknown'
  let dirty = false
  let branch = 'unknown'
  try { commit = execSync('git rev-parse --short HEAD', {cwd: ROOT, stdio:['ignore','pipe','ignore']}).toString().trim() } catch {}
  try { branch = execSync('git rev-parse --abbrev-ref HEAD', {cwd: ROOT, stdio:['ignore','pipe','ignore']}).toString().trim() } catch {}
  try { const s = execSync('git status --porcelain', {cwd: ROOT, stdio:['ignore','pipe','ignore']}).toString().trim(); dirty = s.length>0 } catch {}
  return { commit, branch, dirty }
}

export function generateVersionJson(versionOverride) {
  const version = versionOverride || readVersion()
  const p = parse(version)
  // ensure stored version is normalized
  const normalized = format(p)
  const { commit, branch, dirty } = gitInfo()
  const buildTime = new Date().toISOString()
  let build = 0
  try { build = parseInt(execSync('git rev-list --count HEAD', {cwd: ROOT, stdio:['ignore','pipe','ignore']}).toString().trim(),10) || 0 } catch {}
  const data = { version: normalized, build, commit, branch, dirty, buildTime, continent: p.continent, versionNumber: `${p.major}.${p.minor}.${p.patch}`, revision: String(p.revision).padStart(2,'0'), npmVersion: npmVersion(p) }
  return data
}

export function sync() {
  const data = generateVersionJson()
  // ensure VERSION file holds normalized form
  try{ const curRaw = readVersion(); if(curRaw.trim() !== data.version) writeVersion(data.version) }catch{}
  fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2) + '\n')
  try { fs.mkdirSync(path.dirname(PUBLIC_JSON),{recursive:true}); fs.writeFileSync(PUBLIC_JSON, JSON.stringify(data, null, 2)+'\n') } catch {}
  try {
    const distJson = path.join(ROOT, 'waifu-viewer/dist/version.json')
    if(fs.existsSync(path.join(ROOT,'waifu-viewer/dist'))) fs.writeFileSync(distJson, JSON.stringify(data,null,2)+'\n')
  } catch {}
  // sync waifu-viewer/package.json version field to npm-compatible version
  try{
    const pkgPath = path.join(ROOT,'waifu-viewer/package.json')
    if(fs.existsSync(pkgPath)){
      const pkg = JSON.parse(fs.readFileSync(pkgPath,'utf8'))
      if(pkg.version !== data.npmVersion){
        pkg.version = data.npmVersion
        fs.writeFileSync(pkgPath, JSON.stringify(pkg,null,2)+'\n')
      }
    }
  }catch{}
  // sync apps/desktop/package.json version field as well (electron-builder uses this)
  try{
    const deskPkg = path.join(ROOT,'apps/desktop/package.json')
    if(fs.existsSync(deskPkg)){
      const pkg = JSON.parse(fs.readFileSync(deskPkg,'utf8'))
      if(pkg.version !== data.npmVersion){
        pkg.version = data.npmVersion
        fs.writeFileSync(deskPkg, JSON.stringify(pkg,null,2)+'\n')
      }
    }
  }catch{}
  return data
}

const cmd = process.argv[2]
if(cmd==='bump'){
  const kind = process.argv[3] || 'revision'
  const extra = process.argv[4]
  const cur = readVersion()
  // allow "bump NA" as continent shorthand
  let k = kind
  let e = extra
  if(/^[A-Z]{2,3}$/i.test(kind) && !['major','minor','patch','revision','continent'].includes(kind.toLowerCase())){
    k='continent'; e=kind
  }
  if(k==='continent' && !e) e='EU'
  const next = bump(cur, k.toLowerCase(), e)
  writeVersion(next)
  const data = sync()
  console.log(`bumped ${cur} -> ${next} (${k})`)
  console.log(JSON.stringify(data,null,2))
} else if(cmd==='sync'){
  const data = sync()
  console.log(JSON.stringify(data,null,2))
} else if(cmd==='get' || !cmd){
  const data = generateVersionJson()
  if(process.argv.includes('--write')) sync()
  console.log(JSON.stringify(data,null,2))
}
