#!/usr/bin/env node
// Slim frontend build for releases: temporarily stages waifu-viewer/public/models
// (164MB, installs as a content pack) outside public/ so vite doesn't copy it
// into dist, and skips the backgrounds dist copy via RIKO_SLIM_BUILD.
// Usage: node scripts/build-frontend.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const MODELS = path.join(ROOT, 'waifu-viewer', 'public', 'models')
const STAGED = path.join(ROOT, 'waifu-viewer', '.models-staged')

let moved = false
try {
  if (fs.existsSync(MODELS) && fs.readdirSync(MODELS).length) {
    console.log('[slim] staging public/models aside…')
    if (fs.existsSync(STAGED)) fs.rmSync(STAGED, { recursive: true, force: true })
    fs.renameSync(MODELS, STAGED)
    moved = true
  }
  console.log('[slim] vite build (RIKO_SLIM_BUILD=1)…')
  execSync('npm --prefix waifu-viewer run build', {
    cwd: ROOT, stdio: 'inherit',
    env: { ...process.env, RIKO_SLIM_BUILD: '1' },
  })
  console.log('[slim] done.')
} finally {
  if (moved) {
    console.log('[slim] restoring public/models…')
    if (fs.existsSync(MODELS)) fs.rmSync(MODELS, { recursive: true, force: true })
    fs.renameSync(STAGED, MODELS)
  }
}
