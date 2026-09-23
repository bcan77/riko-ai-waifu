/**
 * extensions.js — optional add-ons (e.g. the .wpkg editor).
 * The editor is NOT bundled with the main app: it lives behind an install
 * flag and is loaded via dynamic import only after the user installs it.
 * Registry source is /extensions.json — local file for testing, meant to be
 * swapped for the GitHub repo listing later without touching this code.
 */
import { getRaw, set as setSettings } from '../settings/store.js'

let _registry = null
let _editorHandle = null

export async function fetchRegistry(){
  if(_registry) return _registry
  try{
    const r = await fetch('/extensions.json', { cache: 'no-store' })
    if(!r.ok) throw new Error('registry ' + r.status)
    const j = await r.json()
    _registry = Array.isArray(j.extensions) ? j.extensions : []
  }catch{
    _registry = []
  }
  return _registry
}

export function isInstalled(id){
  try{ return !!getRaw().extensions?.[id] }catch{ return false }
}

function setInstalled(id, on){
  const cur = getRaw().extensions || {}
  setSettings({ extensions: { ...cur, [id]: !!on } })
  document.body.classList.toggle('ext-wpkg', !!getRaw().extensions?.['wpkg-editor'])
}

export function syncExtensionBody(){
  try{ document.body.classList.toggle('ext-wpkg', !!getRaw().extensions?.['wpkg-editor']) }catch{}
}

/** Install + load an add-on. Returns the loaded handle (editor) or true. */
export async function installExtension(id){
  if(id === 'wpkg-editor'){
    // dynamic import — code-split chunk, never in the initial bundle
    // (editor.css stays statically imported by main.js; inert until mounted)
    const mod = await import('../editor/WpkgEditor.js')
    _editorHandle = mod.mountWpkgEditor()
    window.wpkgEditor = _editorHandle
    setInstalled(id, true)
    return _editorHandle
  }
  setInstalled(id, true)
  return true
}

export function uninstallExtension(id){
  if(id === 'wpkg-editor' && _editorHandle){
    try{ _editorHandle.close() }catch{}
    _editorHandle = null
    try{ window.wpkgEditor = null }catch{}
  }
  setInstalled(id, false)
}

export function getEditorHandle(){ return _editorHandle }
