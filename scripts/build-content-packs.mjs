#!/usr/bin/env node
// Build content-pack zips from the repo layout for GitHub release assets.
// Reads content/packs.json, zips each repo_dir (STORE for wpkg-like speed,
// DEFLATE for the rest) into dist-packs/<asset>.
// Usage: node scripts/build-content-packs.mjs [--out dist-packs]
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const outIdx = process.argv.indexOf('--out')
const OUT = path.resolve(ROOT, outIdx > 0 ? (process.argv[outIdx + 1] || 'dist-packs') : 'dist-packs')

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'packs.json'), 'utf8'))
fs.mkdirSync(OUT, { recursive: true })

for (const p of manifest.packs) {
  const src = path.join(ROOT, p.repo_dir)
  if (!fs.existsSync(src)) {
    console.warn(`[packs] skip ${p.id}: missing ${p.repo_dir}`)
    continue
  }
  const dest = path.join(OUT, p.asset)
  if (fs.existsSync(dest)) fs.rmSync(dest)
  console.log(`[packs] ${p.id}: ${p.repo_dir} -> ${p.asset}`)
  // -0 STORE is fastest for already-compressed media; zip level default otherwise.
  // Use STORE for characters (wpkg media), DEFLATE (-9) for models/backgrounds text? keep simple: STORE all.
  execSync(`zip -0 -qr ${JSON.stringify(dest)} .`, { cwd: src, stdio: 'inherit' })
  const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1)
  console.log(`[packs]   ${mb} MB`)
}
console.log('[packs] done ->', OUT)
