// Version manager — checks for updates and triggers rebuild/refresh
// Works in both dev (HMR) and prod (polling /api/version or /version.json)
// Also drives the gacha-style build badge always visible in bottom corner.

let currentVersion = '0.0.0'
let currentBuildTime = ''
let currentData = null // full {version, build, commit, branch, dirty, buildTime}
try { currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0' } catch { currentVersion = '0.0.0' }
try { currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '' } catch { currentBuildTime = '' }
try { currentData = { version: currentVersion, buildTime: currentBuildTime, build: 0, commit: 'unknown', branch: 'unknown', dirty: false } } catch {}

let pollTimer = null
let checking = false
let updateBanner = null

function formatBadge(data){
  if(!data) return `v${currentVersion}`
  const v = data.version || currentVersion || '0.0.0'
  const b = data.build != null ? `#${data.build}` : ''
  const commit = data.commit && data.commit !== 'unknown' ? data.commit.slice(0,7) : ''
  const branch = data.branch && data.branch !== 'unknown' && data.branch !== 'HEAD' ? ` • ${data.branch}` : ''
  const dirty = data.dirty ? ' • dirty' : ''
  // gacha style: compact but informative: vEU-0.3.7-05 • #42 • abc123 • main dirty
  let parts = [`v${v}`]
  if(b) parts.push(b)
  if(commit) parts.push(commit)
  // branch/dirty as tooltip, but also inline if non-default
  if(data.branch && data.branch!=='unknown' && data.branch!=='HEAD' && data.branch!=='main' && data.branch!=='master') parts.push(data.branch)
  if(data.dirty) parts[parts.length] = parts[parts.length] + '*'
  return parts.join(' • ')
}

function updateBuildBadge(data){
  const el = document.getElementById('buildBadge')
  if(!el) return
  const src = data || currentData || { version: currentVersion, buildTime: currentBuildTime }
  el.textContent = formatBadge(src)
  // tooltip with full details
  const full = src.branch || currentData?.branch || ''
  const dirty = src.dirty ? ' dirty' : ''
  const bt = src.buildTime || currentBuildTime || ''
  const commitFull = src.commit || ''
  el.title = `${src.version || currentVersion} • build ${src.build ?? '?'} • ${commitFull}${full ? ' • '+full:''}${dirty} • ${bt ? new Date(bt).toLocaleString():''} • click to check for updates`
  el.style.cursor = 'pointer'
  if(!el._bound){
    el._bound = true
    el.style.pointerEvents = 'auto'
    el.addEventListener('click', ()=> { window.__checkVersion?.(); el.textContent = formatBadge(src) + ' …' })
  }
}

function createBanner(newVer, oldVer){
  if(updateBanner) return
  const el = document.createElement('div')
  el.id = 'versionBanner'
  el.style.cssText = `position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:rgba(15,23,42,0.98);border:1px solid rgba(14,165,233,0.35);box-shadow:0 12px 40px rgba(2,6,23,0.6);backdrop-filter:blur(12px);font-family:Inter,system-ui,sans-serif;font-size:13px;color:#e2e8f0`
  el.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;font-weight:700"><span style="width:8px;height:8px;border-radius:50%;background:#0ea5e9;box-shadow:0 0 8px #0ea5e9;display:inline-block"></span>Update available</span>
    <span style="opacity:0.7">${oldVer} → ${newVer}</span>
    <button id="versionReload" style="margin-left:8px;padding:6px 12px;border-radius:8px;border:none;background:#0ea5e9;color:#fff;font-weight:700;cursor:pointer">Reload</button>
    <button id="versionDismiss" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(148,163,184,0.15);background:transparent;color:#94a3b8;cursor:pointer">Later</button>
  `
  document.body.appendChild(el)
  updateBanner = el
  el.querySelector('#versionReload').addEventListener('click', ()=> location.reload())
  el.querySelector('#versionDismiss').addEventListener('click', ()=> { el.remove(); updateBanner=null })
}

async function fetchVersion(){
  // try backend first (proxied), fallback to static version.json
  const urls = ['/api/version', '/version.json']
  for(const u of urls){
    try{
      const r = await fetch(u, { cache:'no-store', headers:{'Cache-Control':'no-store'} })
      if(!r.ok) continue
      const j = await r.json()
      // /api/version returns {version, buildTime, needsRebuild,...}, /version.json same without wrapper
      if(j && typeof j.version === 'string') return j
    }catch{}
  }
  return null
}

async function checkForUpdate({ silent=false }={}){
  if(checking) return
  checking = true
  try{
    const data = await fetchVersion()
    if(!data) return
    // keep currentData in sync for badge
    if(data.version){
      currentData = { ...currentData, ...data }
      updateBuildBadge(currentData)
      // also keep topbar version element in sync
      try{
        const tv = document.getElementById('appVersion')
        if(tv) tv.textContent = 'v' + (data.version || currentVersion)
      }catch{}
    }
    const newVer = data.version
    const newBuildTime = data.buildTime || ''
    const needsRebuild = !!data.needsRebuild
    // if version string differs, offer reload
    if(newVer && newVer !== currentVersion){
      if(!silent) console.log(`[version] update available ${currentVersion} -> ${newVer}`, data)
      createBanner(newVer, currentVersion)
      // also dispatch event for app to listen
      window.dispatchEvent(new CustomEvent('version:update', { detail: data }))
      return
    }
    // if same version but buildTime newer (e.g., dirty rebuild), also treat as update when buildTime diffs by >2s
    if(newBuildTime && currentBuildTime && newBuildTime !== currentBuildTime){
      // only if buildTime is newer
      const a = Date.parse(newBuildTime), b = Date.parse(currentBuildTime)
      if(!isNaN(a) && !isNaN(b) && a > b + 2000){
        createBanner(newVer, currentVersion)
        window.dispatchEvent(new CustomEvent('version:update', { detail: data }))
      }
    }
    if(needsRebuild && !silent){
      console.warn('[version] needsRebuild=true — dist stale vs source. Run: npm run build or node scripts/watch-rebuild.mjs')
    }
  } finally { checking=false }
}

export function initVersionManager(opts={}){
  const { pollIntervalMs=30000, checkOnFocus=true, autoReload=false } = opts
  // capture embedded version
  try{ currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : currentVersion }catch{}
  try{ currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : currentBuildTime }catch{}
  try{ if(!currentData) currentData = { version: currentVersion, buildTime: currentBuildTime } }catch{}
  console.log(`[version] current ${currentVersion} built ${currentBuildTime}`)

  // immediate badge paint with embedded values (so something shows even before fetch)
  updateBuildBadge(currentData)
  // also immediately fetch full version details for badge (build/commit) — gacha style needs commit instantly
  fetchVersion().then(d=>{
    if(d){
      currentData = { ...currentData, ...d }
      updateBuildBadge(currentData)
      try{
        const tv = document.getElementById('appVersion')
        if(tv) tv.textContent = 'v' + (d.version || currentVersion)
      }catch{}
    }
  }).catch(()=>{})

  // HMR live update in dev
  if(import.meta.hot){
    import.meta.hot.on('version:update', (data)=>{
      console.log('[version] HMR update', data)
      if(data?.version && data.version !== currentVersion){
        createBanner(data.version, currentVersion)
        if(autoReload) setTimeout(()=> location.reload(), 1500)
      } else if(data?.buildTime && data.buildTime !== currentBuildTime){
        // timestamp bump without version bump — still notify
        console.log('[version] buildTime changed', data.buildTime)
      }
      if(data){
        currentData = { ...currentData, ...data }
        updateBuildBadge(currentData)
      }
    })
  }

  // polling for prod (and dev fallback)
  if(pollIntervalMs>0){
    pollTimer = setInterval(()=> checkForUpdate({silent:true}), pollIntervalMs)
  }
  if(checkOnFocus){
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState==='visible') checkForUpdate({silent:true})
    })
    window.addEventListener('focus', ()=> checkForUpdate({silent:true}))
  }
  // immediate check on boot (not delayed 2.5s) — satisfies "check for updated on boot"
  setTimeout(()=> checkForUpdate({silent:true}), 400)
  // also second pass slightly later to catch race where backend wasn't ready at 400ms
  setTimeout(()=> checkForUpdate({silent:true}), 2500)

  // expose manual check
  window.__checkVersion = ()=> checkForUpdate({silent:false})

  return { check: checkForUpdate, getCurrent: ()=> ({ version: currentVersion, buildTime: currentBuildTime, ...currentData }) }
}

export function getVersion(){ return currentVersion }
