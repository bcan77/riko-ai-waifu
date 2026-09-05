/**
 * tools.js — idle physics, eye tracking, hitboxing, VMD hot-swap, prosody, affinity
 */
import * as THREE from 'three';

export function setupHitboxing(renderer, camera, getMesh, onHit) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (e) => {
    const mesh = getMesh(); if (!mesh) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(mesh, true);
    if (!hits.length) return;
    const p = hits[0].point;
    // crude zones by height (world y)
    let zone = 'body';
    if (p.y > 13) zone = 'head';
    else if (p.y > 10) zone = 'chest';
    else if (p.y > 6) zone = 'torso';
    onHit?.(zone, hits[0]);
  });
}

export function setupEyeTracking(camera, getMesh, renderer) {
  let target = new THREE.Vector2(0, 0);
  renderer.domElement.addEventListener('mousemove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    target.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    target.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });
  // tick called per frame: nudge head/eye bones via morph or bone IK
  return {
    tick(mesh, dt) {
      if (!mesh || !mesh.skeleton) return;
      // find head bone
      const head = mesh.skeleton.bones.find(b => /頭|head/i.test(b.name));
      if (!head) return;
      // subtle look: lerp rotation toward mouse
      const yaw = target.x * 0.15;
      const pitch = target.y * 0.1;
      head.rotation.y += (yaw - head.rotation.y) * dt * 2;
      head.rotation.x += (pitch - head.rotation.x) * dt * 2;
    }
  };
}

export async function hotSwapVmd(fileOrName, getMesh, helper, loader, params, setStatus, toast) {
  const mesh = getMesh(); if (!mesh || !helper) return;
  // resolve name -> /vmd/<name>.vmd or /api/vmd lookup
  let url = null;
  if (fileOrName.includes('.vmd') || fileOrName.startsWith('/')) url = fileOrName;
  else {
    // try /vmd/<name>.vmd then fallback to list
    const candidates = [`/vmd/${encodeURIComponent(fileOrName)}.vmd`, `/vmd/${encodeURIComponent(fileOrName)}.VMD`];
    for (const u of candidates) {
      try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok) { url = u; break; } } catch {}
    }
    if (!url) {
      // fetch list
      try {
        const r = await fetch('/api/vmd'); const list = await r.json();
        const hit = list.find(x => x.name.toLowerCase() === fileOrName.toLowerCase() || x.id === fileOrName.toLowerCase());
        if (hit) url = hit.file;
      } catch {}
    }
  }
  if (!url) { toast?.(`VMD not found: ${fileOrName}`); return; }
  setStatus?.('Hot-swapping ' + fileOrName + '…', 'warn');
  try {
    const clip = await new Promise((res, rej) => loader.loadAnimation(encodeURI(url), mesh, res, undefined, rej));
    // hot-swap without full reset: remove then add
    try { helper.remove(mesh); } catch {}
    const g = new THREE.Vector3(0, -18, 0);
    helper.add(mesh, { animation: clip, physics: params.physics, gravity: g, unitStep: 1/90, maxStepNum: 8 });
    helper.enable('physics', params.physics);
    helper.enable('ik', params.ik);
    const obj = helper.objects.get(mesh);
    if (obj?.mixer) { obj.mixer.timeScale = params.speed; obj.mixer._actions?.forEach(a => a.reset().play()); }
    toast?.('Playing ' + fileOrName);
    setStatus?.('Playing • ' + fileOrName);
  } catch (e) { toast?.('VMD hot-swap failed: ' + e.message, 'err'); }
}

// Affinity meter 0-1 persisted, influences default emotion bias
export const affinity = {
  get() { return parseFloat(localStorage.getItem('waifu:affinity') || '0.5'); },
  set(v) { localStorage.setItem('waifu:affinity', String(Math.max(0, Math.min(1, v)))); },
  bump(delta) { const cur = affinity.get(); affinity.set(cur + delta); return affinity.get(); },
  // on positive chat (user says thanks etc) bump, negative bump down
  nudgeFromText(text) {
    const t = text.toLowerCase();
    if (/(thank|love|great|awesome|かわいい|ありがとう)/.test(t)) return affinity.bump(0.02);
    if (/(hate|bad|annoying|うざい)/.test(t)) return affinity.bump(-0.03);
    return affinity.get();
  }
};

// Prosody: simple playbackRate/detune control via waifuClient
export function applyProsody(waifuClient, { rate, pitch, energy }) {
  if (!waifuClient?.audioCtx) return;
  // rate affects next AudioBufferSource playbackRate
  if (rate) waifuClient.prosodyRate = Math.max(0.7, Math.min(1.4, rate));
  if (pitch !== undefined) waifuClient.prosodyPitch = pitch; // semitones
  if (energy !== undefined) waifuClient.prosodyEnergy = energy;
}
