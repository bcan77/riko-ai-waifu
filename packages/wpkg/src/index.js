import fs from 'node:fs';
import path from 'node:path';
import { validateManifest } from './manifest.js';

// .wpkg is just a zip with .wpkg extension. We use pure JS zip via `jszip` if available,
// else fallback to `adm-zip` style via shell `zip/unzip` for minimal deps.
let JSZip = null;
try { JSZip = (await import('jszip')).default; } catch {}

const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED_EXTS = new Set(['.pmx','.pmd','.vmd','.png','.jpg','.jpeg','.bmp','.tga','.spa','.sph','.md','.json','.wav','.mp3']);

function isSafeEntry(name) {
  if (!name || name.includes('..') || name.startsWith('/') || name.includes('\0')) return false;
  // allow manifest.json at root, preview.png etc
  return true;
}

export async function pack(srcDir, outWpkg) {
  srcDir = path.resolve(srcDir);
  outWpkg = path.resolve(outWpkg);
  const manifestPath = path.join(srcDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('manifest.json missing in ' + srcDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errs = validateManifest(manifest);
  if (errs.length) throw new Error('manifest invalid: ' + errs.join(', '));

  // collect files
  const files = [];
  function walk(dir, relBase) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const rel = path.join(relBase, ent.name);
      if (ent.isDirectory()) walk(full, rel);
      else {
        if (!isSafeEntry(rel)) throw new Error('unsafe entry: ' + rel);
        files.push({ full, rel });
      }
    }
  }
  walk(srcDir, '');

  // size check
  let total = 0;
  for (const f of files) total += fs.statSync(f.full).size;
  if (total > MAX_BYTES) throw new Error(`wpkg too large: ${(total/1024/1024).toFixed(1)}MB > 200MB`);

  if (JSZip) {
    const zip = new JSZip();
    for (const f of files) {
      const data = fs.readFileSync(f.full);
      zip.file(f.rel, data, { compression: 'STORE' }); // like wallpaper engine .pkg STORE
    }
    // magic header handled as comment; actual magic not needed for zip compat but we prepend 4 bytes if extractor expects
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    fs.mkdirSync(path.dirname(outWpkg), { recursive: true });
    // prepend WPKG magic for identification (optional, not breaking zip: we store as file comment hack would break; so just write raw zip)
    fs.writeFileSync(outWpkg, buf);
  } else {
    // fallback: use system zip
    fs.mkdirSync(path.dirname(outWpkg), { recursive: true });
    const tmpList = path.join('/tmp', `wpkg-${Date.now()}.txt`);
    fs.writeFileSync(tmpList, files.map(f => f.rel).join('\n'));
    // use `zip` if available
    const { execSync } = await import('node:child_process');
    try {
      execSync(`cd "${srcDir}" && zip -0 -X -q "${outWpkg}" -r .`, { stdio: 'inherit' });
    } catch (e) {
      throw new Error('pack failed: install jszip (`npm i jszip`) or ensure `zip` is available. ' + e.message);
    }
  }
  const st = fs.statSync(outWpkg);
  return { out: outWpkg, bytes: st.size, files: files.length };
}

export async function unpack(wpkgPath, destDir) {
  wpkgPath = path.resolve(wpkgPath);
  destDir = path.resolve(destDir);
  if (!fs.existsSync(wpkgPath)) throw new Error('wpkg not found: ' + wpkgPath);
  const stat = fs.statSync(wpkgPath);
  if (stat.size > MAX_BYTES) throw new Error('wpkg exceeds 200MB');
  fs.mkdirSync(destDir, { recursive: true });

  if (JSZip) {
    const data = fs.readFileSync(wpkgPath);
    const zip = await JSZip.loadAsync(data);
    for (const [rel, entry] of Object.entries(zip.files)) {
      if (!isSafeEntry(rel)) throw new Error('unsafe entry in wpkg: ' + rel);
      if (entry.dir) { fs.mkdirSync(path.join(destDir, rel), { recursive: true }); continue; }
      const buf = await entry.async('nodebuffer');
      const out = path.join(destDir, rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
    }
  } else {
    const { execSync } = await import('node:child_process');
    execSync(`unzip -q -o "${wpkgPath}" -d "${destDir}"`);
  }
  const manifestPath = path.join(destDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('wpkg missing manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const errs = validateManifest(manifest);
  if (errs.length) throw new Error('unpacked manifest invalid: ' + errs.join(', '));
  return manifest;
}

export { validateManifest } from './manifest.js';
