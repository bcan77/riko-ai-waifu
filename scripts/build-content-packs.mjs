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
  // python zipfile, ZIP_STORED (no compression — media is already compressed)
  const helper = path.join(OUT, '.zip-helper.py')
  fs.writeFileSync(helper, `import os,zipfile,sys
src, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_STORED) as z:
    for root, dirs, files in os.walk(src):
        for fn in files:
            full = os.path.join(root, fn)
            z.write(full, os.path.relpath(full, src))
print('zipped', dest)
`)
  execSync(`python3 ${JSON.stringify(helper)} ${JSON.stringify(src)} ${JSON.stringify(dest)}`, { cwd: ROOT, stdio: 'inherit' })
  try { fs.rmSync(helper) } catch {}
  const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1)
  console.log(`[packs]   ${mb} MB`)
}
console.log('[packs] done ->', OUT)
