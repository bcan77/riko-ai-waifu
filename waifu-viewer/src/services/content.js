/**
 * content.js — downloadable content packs (characters, models, backgrounds).
 * The engine ships slim; packs install on demand from the repo's GitHub
 * release assets via the backend (/api/content/*), which streams, validates
 * and extracts them into the user content dir (or repo layout in dev).
 */

export async function fetchPacks(){
  const r = await fetch('/api/content/packs', { cache: 'no-store' })
  if(!r.ok) throw new Error('content api ' + r.status)
  return r.json()
}

export async function installPack(id){
  const r = await fetch('/api/content/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const j = await r.json().catch(() => ({}))
  if(!r.ok || !j.ok) throw new Error(j.detail || j.error || ('install failed ' + r.status))
  return j.task
}

export async function pollTask(taskId){
  const r = await fetch('/api/content/tasks/' + encodeURIComponent(taskId), { cache: 'no-store' })
  if(!r.ok) throw new Error('task ' + r.status)
  return r.json()
}

/** Poll until done/error. onTick receives the task state. */
export async function installAndWait(id, onTick){
  const task = await installPack(id)
  for(;;){
    await new Promise(r => setTimeout(r, 1000))
    const st = await pollTask(task)
    onTick?.(st)
    if(st.state === 'done' || st.state === 'error') return st
  }
}

export async function removePack(id){
  const r = await fetch('/api/content/packs/' + encodeURIComponent(id), { method: 'DELETE' })
  const j = await r.json().catch(() => ({}))
  if(!r.ok || !j.ok) throw new Error(j.detail || ('remove failed ' + r.status))
  return j
}

export function notifyContentChanged(){
  try{ window.dispatchEvent(new CustomEvent('content:changed')) }catch{}
}
