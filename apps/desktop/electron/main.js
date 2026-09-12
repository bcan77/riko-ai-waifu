import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, globalShortcut, desktopCapturer, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

// Arch/mesa vsync quirk — harmless log spam, but also ensure GPU rasterization
app.commandLine.appendSwitch('ignore-gpu-blocklist');
try{ app.commandLine.appendSwitch('enable-gpu-rasterization') }catch{}
// Headless / no DISPLAY (WSL, SSH, CI) — Electron without --no-sandbox --disable-gpu exits 0 immediately
if(!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY){
  try{ app.commandLine.appendSwitch('no-sandbox') }catch{}
  try{ app.commandLine.appendSwitch('disable-gpu') }catch{}
  try{ app.disableHardwareAcceleration() }catch{}
}

// silence harmless probe warning when vite isn't running
process.on('warning', (w) => {
  const msg = String(w?.message || w);
  if (msg.includes('Failed to load URL') && msg.includes('ERR_CONNECTION_REFUSED')) return;
  if (w?.name === 'ElectronWarning' && msg.includes('ERR_CONNECTION_REFUSED')) return;
  console.warn(w);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let win = null;
let tray = null;
let backendProc = null;

// ── troubleshooting logger ───────────────────────────────────────────────
let LOG_FILE = null;
try { LOG_FILE = path.join(app.getPath('userData'), 'waifu-debug.log'); } catch { try { LOG_FILE = path.join(process.env.HOME || '/tmp', '.waifu-desktop-debug.log'); } catch { LOG_FILE = '/tmp/waifu-desktop-debug.log'; } }
function _logLine(level, ...args) {
  const ts = new Date().toISOString();
  const msg = `[${ts}] [${level}] ${args.map(a => typeof a === 'string' ? a : (()=>{ try{ return JSON.stringify(a)}catch{ return String(a)}})()).join(' ')}`;
  if (level === 'ERROR') console.error(msg); else console.log(msg);
  try { if (LOG_FILE) fs.appendFileSync(LOG_FILE, msg + '\n'); } catch {}
}
const tlog = (...a) => _logLine('MAIN', ...a);
const terr = (...a) => _logLine('ERROR', ...a);
tlog('=== Waifu Desktop starting ===', `LOG_FILE=${LOG_FILE}`, `VERSION=${app.getVersion()||'unknown'}`, `ELECTRON=${process.versions.electron}`, `NODE=${process.versions.node}`, `DISPLAY=${process.env.DISPLAY||''}`, `WAYLAND=${process.env.WAYLAND_DISPLAY||''}`, `CWD=${process.cwd()}`, `DIRNAME=${__dirname}`);
try { if (LOG_FILE) fs.writeFileSync(LOG_FILE, `=== Waifu Desktop log ${new Date().toISOString()} ===\n`); } catch {}
process.on('uncaughtException', (e) => { terr('uncaughtException', e?.stack || e?.message || String(e)); });
process.on('unhandledRejection', (r) => { terr('unhandledRejection', r?.stack || r?.message || String(r)); });
app.on('before-quit', (e) => tlog('[lifecycle] before-quit'));
app.on('will-quit', (e) => tlog('[lifecycle] will-quit'));
app.on('window-all-closed', () => tlog('[lifecycle] window-all-closed', `platform=${process.platform}`, `willQuit=${process.platform !== 'darwin'}`));
app.on('quit', (e, code) => tlog('[lifecycle] quit', `code=${code}`));
app.on('gpu-process-crashed', (e, killed) => terr('[gpu] gpu-process-crashed', `killed=${killed}`));
app.on('render-process-gone', (e, wc, details) => terr('[render] app render-process-gone', JSON.stringify(details)));
// log vite/electron env
tlog('[env] VITE_DEV_SERVER_URL=', process.env.VITE_DEV_SERVER_URL || '(default http://localhost:5173)', 'PORT=', process.env.PORT || '8000', 'BACKEND_PORT=', process.env.BACKEND_PORT || '8000');
tlog('[env] argv=', process.argv.join(' '));

// ── window bounds persistence (dynamic resolution friendly) ──────────
function boundsPath(){ return path.join(app.getPath('userData'), 'window-bounds.json') }
function loadBounds(){
  try{
    const j = JSON.parse(fs.readFileSync(boundsPath(),'utf8'));
    if(j && typeof j.width==='number' && typeof j.height==='number') return j;
  }catch{}
  return null;
}
function saveBounds(){
  if(!win || win.isDestroyed()) return;
  try{
    // don't save when maximized/fullscreen — save the restore bounds
    const b = win.isMaximized() || win.isFullScreen() ? null : win.getBounds();
    if(b) fs.writeFileSync(boundsPath(), JSON.stringify(b));
  }catch{}
}
function defaultBounds(){
  try{
    const disp = screen.getPrimaryDisplay();
    const wa = disp.workArea;
    // 78% of work area, clamped — feels good on 1080p, 1440p, and 4K
    const w = Math.round(Math.min(1480, Math.max(1024, wa.width * 0.78)));
    const h = Math.round(Math.min(920, Math.max(640, wa.height * 0.80)));
    return { width:w, height:h, x: Math.round(wa.x + (wa.width - w)/2), y: Math.round(wa.y + (wa.height - h)/2) };
  }catch{ return { width:1280, height:800 } }
}

async function isPortFree(port, host='127.0.0.1'){
  return new Promise(res=>{
    const s=net.createServer();
    s.once('error',()=>res(false));
    s.once('listening',()=> s.close(()=>res(true)));
    s.listen(port, host);
  });
}
async function waitForHealth(url, ms=8000){
  const start=Date.now();
  let attempts=0;
  while(Date.now()-start < ms){
    attempts++;
    try{
      const r=await fetch(url);
      tlog(`[backend] waitForHealth attempt ${attempts} ${url} -> ${r.status} ${r.ok?'ok':'fail'}`);
      if(r.ok) return true;
    }catch(e){ if(attempts<=3 || attempts%5===0) tlog(`[backend] waitForHealth attempt ${attempts} ${url} error:`, e.message); }
    await new Promise(r=>setTimeout(r,200));
  }
  tlog(`[backend] waitForHealth timeout after ${attempts} attempts ${url}`);
  return false;
}
async function startBackend() {
  tlog('[backend] startBackend() probing :8000 ...');
  if(await waitForHealth('http://127.0.0.1:8000/health', 600)){
    tlog('[backend] already running on :8000 — reuse');
    return;
  }
  const free = await isPortFree(8000);
  tlog(`[backend] port 8000 free=${free}`);
  if(!free){
    tlog('[backend] port 8000 busy but healthcheck failed — trying 8001');
    process.env.BACKEND_PORT='8001';
    return startBackendOn(8001);
  }
  return startBackendOn(8000);
}
async function startBackendOn(port){
  const backendDir = path.resolve(__dirname, '../../..', 'backend');
  const candidates = [
    path.join(backendDir, '.venv/bin/python'),
    '/tmp/waifu-venv/bin/python',
  ];
  let py = candidates.find(p => fs.existsSync(p));
  if(!py){
    // no venv found — try to bootstrap backend/.venv automatically
    console.log('[backend] no venv found, bootstrapping backend/.venv ...');
    try{
      const { spawnSync } = await import('node:child_process');
      const venvDir = path.join(backendDir, '.venv');
      let r = spawnSync('python3', ['-m', 'venv', venvDir], { stdio: 'inherit', cwd: backendDir });
      if(r.status === 0){
        const pip = path.join(venvDir, 'bin/pip');
        r = spawnSync(pip, ['install', '-r', path.join(backendDir, 'requirements.txt')], { stdio: 'inherit', cwd: backendDir });
        if(r.status === 0) py = path.join(venvDir, 'bin/python');
        else console.warn('[backend] pip install failed — run manually: pip install -r backend/requirements.txt');
      }
    }catch(e){ console.warn('[backend] auto-bootstrap failed', e.message); }
    if(!py) py = 'python3';
  }
  tlog(`[backend] spawning ${py} -m uvicorn app.main:app --host 127.0.0.1 --port ${port} --app-dir ${backendDir} (cwd=${backendDir})`);
  try {
    backendProc = spawn(py, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port), '--app-dir', backendDir], { cwd: backendDir, stdio: 'inherit' });
    tlog(`[backend] spawned pid=${backendProc.pid||'unknown'} on :${port}`);
    backendProc.on('error', e => terr('[backend] spawn error', e.message, e.stack||''));
    backendProc.on('exit', (code, sig)=>{ tlog(`[backend] exited code=${code} sig=${sig} — port ${port}`); if(code && code!==0 && code!==null) terr(`[backend] exited ${code} sig=${sig} — port ${port} may still be busy`); });
    backendProc.on('spawn', () => tlog(`[backend] spawn event pid=${backendProc.pid}`));
    waitForHealth(`http://127.0.0.1:${port}/health`, 9000).then(ok=> tlog(`[backend] health ${ok?'ok':'timeout'} on :${port}`));
  } catch (e) { terr('[backend] failed', e.message, e.stack||''); }
}

async function createWindow() {
  const saved = loadBounds();
  const def = defaultBounds();
  const init = saved ? { width: Math.max(360, Math.min(saved.width, 2560)), height: Math.max(360, Math.min(saved.height, 1440)), x: saved.x, y: saved.y } : def;

  win = new BrowserWindow({
    ...init,
    minWidth: 360, minHeight: 380,
    title: 'Waifu MMD — Desktop',
    icon: path.join(__dirname, '../public/favicon.svg'),
    webPreferences: {
      preload: path.join(__dirname, fs.existsSync(path.join(__dirname, 'preload.cjs')) ? 'preload.cjs' : 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#0b0c10',
    show: false,
    autoHideMenuBar: true,
  });

  // restore maximized state
  try{
    const j = saved ? JSON.parse(fs.readFileSync(boundsPath(),'utf8')) : null;
    if(j?.maximized) win.maximize();
  }catch{}

  tlog('[window] BrowserWindow created', `init=${JSON.stringify(init)}`, `saved=${JSON.stringify(saved)}`);
  win.once('ready-to-show', () => { tlog('[window] ready-to-show -> show()'); try{ win.show(); }catch(e){ terr('[window] show() failed', e.message)} });
  // fallback: if GPU dies before first paint, ready-to-show never fires → window stays hidden and app quits via window-all-closed
  setTimeout(()=>{ if(win && !win.isDestroyed() && !win.isVisible()){ tlog('[window] fallback show() after 3s (ready-to-show never fired)'); try{ win.show(); }catch(e){ terr('[window] fallback show failed', e.message)} } }, 3000);
  // troubleshooting: log all window/webContents events
  win.on('close', (e) => { tlog('[window] close event', `isDestroyed=${win.isDestroyed()}`); });
  win.on('closed', () => { tlog('[window] closed event -> win=null'); win=null; });
  win.on('show', () => tlog('[window] show'));
  win.on('hide', () => tlog('[window] hide'));
  win.on('unresponsive', () => terr('[window] unresponsive'));
  win.on('responsive', () => tlog('[window] responsive'));
  win.webContents.on('did-start-loading', () => tlog('[webContents] did-start-loading', win.webContents.getURL()));
  win.webContents.on('did-start-navigation', (e, url) => tlog('[webContents] did-start-navigation', url));
  win.webContents.on('did-finish-load', () => tlog('[webContents] did-finish-load', win.webContents.getURL()));
  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => { terr('[webContents] did-fail-load', `code=${code} desc=${desc} url=${url} isMainFrame=${isMainFrame}`); });
  win.webContents.on('render-process-gone', (e, details) => { terr('[webContents] render-process-gone', JSON.stringify(details)); });
  win.webContents.on('crashed', (e, killed) => { terr('[webContents] crashed', `killed=${killed}`); });
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    const lvl = ['debug','info','warn','error'][level] || level;
    _logLine(`RENDERER:${lvl}`, `[${sourceId}:${line}] ${message}`);
  });
  win.webContents.on('preload-error', (e, preloadPath, error) => { terr('[webContents] preload-error', preloadPath, error?.message||String(error)); });

  // persist bounds on move/resize (debounced)
  let saveT=null;
  const debouncedSave=()=>{ clearTimeout(saveT); saveT=setTimeout(()=>{
    if(win.isMaximized()){ try{ const b=loadBounds()||{}; fs.writeFileSync(boundsPath(), JSON.stringify({...b, maximized:true})) }catch{} }
    else saveBounds();
  }, 500) };
  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);
  win.on('close', ()=>{ try{ saveBounds() }catch{} });

  // dynamic resolution: when display DPI changes (drag between monitors),
  // notify renderer so it can re-evaluate DPR
  try{
    screen.on('display-metrics-changed', (_e, disp, changed)=>{
      if(changed.includes('scaleFactor') && win && !win.isDestroyed()){
        win.webContents.setZoomFactor(win.webContents.getZoomFactor()); // nudge
        win.webContents.send('display:metrics', { scaleFactor: disp.scaleFactor });
      }
    });
  }catch{}

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const fallbackDir = path.resolve(__dirname, '../../..', 'waifu-viewer/dist');
  const fallbackIndex = path.join(fallbackDir, 'index.html');
  let fallbackServer = null;
  const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json','.wasm':'application/wasm','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.pmx':'application/octet-stream','.pmd':'application/octet-stream','.vmd':'application/octet-stream','.tga':'image/x-tga','.spa':'application/octet-stream','.sph':'application/octet-stream','.bmp':'image/bmp','.fbx':'application/octet-stream','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.obj':'text/plain','.hdr':'application/octet-stream','.exr':'application/octet-stream','.gif':'image/gif' };
  async function serveFallbackOverHttp(){
    if(!fs.existsSync(fallbackIndex)){
      await win.loadURL('data:text/html,<h1>Run `npm run dev` in waifu-viewer, or `npm --prefix waifu-viewer run build` first</h1>');
      return;
    }
    // find free port for static dist server
    const http = await import('node:http');
    const getFreePort = () => new Promise(res=>{
      const s = net.createServer(); s.listen(0, '127.0.0.1', ()=>{ const p=s.address().port; s.close(()=>res(p)); });
      s.on('error', ()=>res(0));
    });
    const port = await getFreePort() || 3123;
    // helper: list backgrounds from dist/backgrounds (and fallback to project backgrounds/) for offline fallback
    function listLocalBackgrounds(){
      const roots = [path.join(fallbackDir, 'backgrounds'), path.resolve(__dirname, '../../..', 'backgrounds')]
      const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.bmp','.gif','.hdr','.exr'])
      const MODEL_EXTS = new Set(['.fbx','.glb','.gltf','.obj','.pmx','.pmd'])
      const out = []; const seen = new Set(); const modelMap = new Map(); const modelTops = new Set()
      for(const base of roots){
        if(!fs.existsSync(base)) continue
        const walk=(dir)=>{
          for(const e of fs.readdirSync(dir,{withFileTypes:true})){
            const full=path.join(dir,e.name)
            if(e.isDirectory()) walk(full)
            else {
              const ext=path.extname(full).toLowerCase()
              if(!MODEL_EXTS.has(ext)) continue
              const rel=path.relative(base,full).split(path.sep).join('/')
              const top=rel.includes('/')?rel.split('/')[0]:rel
              if(top && rel.includes('/')) modelTops.add(top)
              if(!modelMap.has(top||rel)) modelMap.set(top||rel,{file:rel,ext})
            }
          }
        }
        try{ walk(base) }catch{}
      }
      for(const [bid,info] of modelMap){ if(seen.has(bid)) continue; seen.add(bid); out.push({id:bid,name:bid.replace(/[_-]+/g,' ').trim(),file:`/backgrounds/${info.file.split('/').map(encodeURIComponent).join('/')}`,type:'model',ext:info.ext,modelFile:info.file}) }
      for(const base of roots){
        if(!fs.existsSync(base)) continue
        const walk2=(dir)=>{
          for(const e of fs.readdirSync(dir,{withFileTypes:true})){
            const full=path.join(dir,e.name)
            if(e.isDirectory()) walk2(full)
            else {
              const ext=path.extname(full).toLowerCase()
              if(!IMAGE_EXTS.has(ext)) continue
              const rel=path.relative(base,full).split(path.sep).join('/')
              if(seen.has(rel)) continue
              const top=rel.includes('/')?rel.split('/')[0]:''
              if(top && modelTops.has(top)) continue
              seen.add(rel)
              const name=path.basename(rel,path.extname(rel))
              const folder=path.posix.dirname(rel)
              const label=folder&&folder!=='.'?`${folder}/${name}`:name
              out.push({id:rel,name:label,file:`/backgrounds/${rel.split('/').map(encodeURIComponent).join('/')}`,type:'image'})
            }
          }
        }
        try{ walk2(base) }catch{}
      }
      out.sort((a,b)=>(a.type==='model'&&b.type!=='model'?-1:b.type==='model'&&a.type!=='model'?1:a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
      return out
    }
    fallbackServer = http.createServer(async (req, res)=>{
      try{
        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        let pathname = decodeURIComponent(url.pathname);
        // serve /api/backgrounds locally if backend not reachable — this is why
        // "background doesn't show up in settings" in Electron offline / fallback mode.
        if(pathname === '/api/backgrounds' || pathname === '/api/backgrounds/list'){
          // try backend first, fall back to local scan on failure
          const target = `http://127.0.0.1:${process.env.BACKEND_PORT || 8000}${pathname}${url.search}`;
          ;(async ()=>{
            try{
              const r = await fetch(target, { signal: AbortSignal.timeout(800) });
              if(r.ok){
                res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
                res.end(await r.text());
                return
              }
              throw new Error('backend not ok '+r.status)
            }catch{
              try{
                const local = listLocalBackgrounds()
                res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
                res.end(JSON.stringify(local))
              }catch(e){ res.writeHead(500); res.end(String(e.message||e)) }
            }
          })();
          return
        }
        // serve /backgrounds/* static directly from dist (no backend hop) for speed
        if(pathname.startsWith('/backgrounds/')){
          // pathname is already decodeURIComponent at top, so rel is raw unicode (e.g. "на скетч в2.fbx")
          const rel = pathname.slice('/backgrounds/'.length)
          if(rel.includes('..') || rel.includes('\0')){ res.writeHead(400); res.end('bad path'); return }
          function findTol(fname){
            const alts=[fname]
            const low=fname.toLowerCase()
            if(low.endsWith('.jpg')) alts.push(fname.slice(0,-4)+'.jpeg')
            else if(low.endsWith('.jpeg')) alts.push(fname.slice(0,-5)+'.jpg')
            const bases=[path.join(fallbackDir,'backgrounds'), path.resolve(__dirname,'../../..','backgrounds'), path.resolve(__dirname,'../../..','waifu-viewer/public/backgrounds')]
            for(const base of bases){
              for(const q of alts){
                for(const probe of [path.join(base,'Cozy-Living-Room','textures',q), path.join(base,'textures',q), path.join(base,q)]){
                  try{ if(fs.existsSync(probe)&&fs.statSync(probe).isFile()) return probe }catch{}
                }
              }
            }
            // stem fallback
            const stem = path.basename(fname, path.extname(fname)).toLowerCase()
            for(const base of bases){
              if(!fs.existsSync(base)) continue
              const walk=(dir)=>{
                for(const e of fs.readdirSync(dir,{withFileTypes:true})){
                  const full=path.join(dir,e.name)
                  if(e.isDirectory()){ const r=walk(full); if(r) return r }
                  else if(path.basename(full, path.extname(full)).toLowerCase()===stem && ['.jpg','.jpeg','.png','.webp','.bmp'].includes(path.extname(full).toLowerCase())) return full
                }
                return null
              }
              try{ const r=walk(base); if(r) return r }catch{}
            }
            return null
          }
          const candidates = [path.join(fallbackDir,'backgrounds',rel), path.resolve(__dirname,'../../..','backgrounds',rel), path.resolve(__dirname,'../../..','waifu-viewer/public/backgrounds',rel)]
          let found = candidates.find(p=>{ try{ return fs.existsSync(p)&&fs.statSync(p).isFile() }catch{return false} })
          // tolerant direct texture alternate ext
          if(!found && rel.toLowerCase().includes('textures')){
            const fname = path.basename(rel)
            const tol=findTol(fname)
            if(tol) found=tol
          }
          if(!found && (rel.includes('.fbm') || rel.toLowerCase().includes('textures'))){
            const fname = path.basename(rel)
            const tol=findTol(fname)
            if(tol) found=tol
            else {
              for(const base of [path.join(fallbackDir,'backgrounds'), path.resolve(__dirname,'../../..','backgrounds')]){
                const probe = path.join(base,'Cozy-Living-Room','textures',fname)
                try{ if(fs.existsSync(probe)&&fs.statSync(probe).isFile()){ found=probe; break }}catch{}
              }
            }
          }
          // if still not found, try backend as fallback (covers any other mismatch)
          if(!found){
            // missing optional roughness/metallic -> 204
            const low=rel.toLowerCase()
            if(low.includes('roughness')||low.includes('metallic')){
              res.writeHead(204, {'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'})
              res.end(); return
            }
            const alt = findTol(path.basename(rel))
            if(alt) found=alt
          }
          if(found){
            const ext=path.extname(found).toLowerCase()
            res.writeHead(200, {'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'})
            fs.createReadStream(found).pipe(res)
            return
          }
          // last resort: proxy to backend for /backgrounds/* (backend is tolerant)
          // do backend hop instead of 404
          {
            const target = `http://127.0.0.1:${process.env.BACKEND_PORT || 8000}/backgrounds/${rel.split('/').map(encodeURIComponent).join('/')}`
            try{
              const r = await fetch(target)
              if(r.ok){
                const buf = Buffer.from(await r.arrayBuffer())
                const ct = r.headers.get('content-type') || MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream'
                res.writeHead(200, {'Content-Type': ct, 'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'})
                res.end(buf); return
              }
            }catch{}
            // if backend also 404 for optional, 204
            const low2=rel.toLowerCase()
            if(low2.includes('roughness')||low2.includes('metallic')){
              res.writeHead(204, {'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}); res.end(); return
            }
          }
          // if not found, fall through to proxy-or-404 below instead of SPA index.html
        }
        // version: try backend first (needsRebuild/hasDist), fallback to local version.json (root or dist)
        if(pathname === '/api/version' || pathname === '/version.json'){
          const target = `http://127.0.0.1:${process.env.BACKEND_PORT || 8000}${pathname}${url.search}`;
          ;(async ()=>{
            try{
              const r = await fetch(target, { signal: AbortSignal.timeout(1500) });
              if(r.ok){
                res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
                res.end(await r.text()); return;
              }
              throw new Error('backend not ok');
            }catch{
              try{
                const candidates = [
                  path.resolve(__dirname, '../../..', 'version.json'),
                  path.resolve(__dirname, '../../..', 'waifu-viewer/public/version.json'),
                  path.join(fallbackDir, 'version.json')
                ];
                for(const p of candidates){
                  if(fs.existsSync(p) && fs.statSync(p).isFile()){
                    res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
                    fs.createReadStream(p).pipe(res); return;
                  }
                }
                // fallback generate minimal
                const j = { version: 'EU-0.3.9-01', build:0, commit:'unknown', branch:'unknown', dirty:false, buildTime: new Date().toISOString() };
                res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
                res.end(JSON.stringify(j)); return;
              }catch(e){ res.writeHead(500); res.end(String(e.message||e)); }
            }
          })();
          return;
        }
        // proxy api/health to backend (8000 or 8001) — buffer body for POST/PUT
        if(pathname.startsWith('/api/') || pathname.startsWith('/health')){
          const target = `http://127.0.0.1:${process.env.BACKEND_PORT || 8000}${pathname}${url.search}`;
          ;(async ()=>{
            try{
              let body;
              if(!['GET','HEAD'].includes(req.method)){
                const chunks=[];
                await new Promise((resolve,reject)=>{
                  req.on('data', c=>chunks.push(c));
                  req.on('end', resolve);
                  req.on('error', reject);
                });
                if(chunks.length) body = Buffer.concat(chunks);
              }
              const fwdHeaders={};
              for(const [k,v] of Object.entries(req.headers)){
                const lk=k.toLowerCase();
                if(lk==='host'||lk==='connection'||lk==='content-length') continue;
                fwdHeaders[k]=v;
              }
              if(body) fwdHeaders['content-length']=String(body.length);
              const r = await fetch(target, { method:req.method, headers:fwdHeaders, body, duplex: body?'half':undefined });
              res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
              const buf = Buffer.from(await r.arrayBuffer());
              res.end(buf);
            }catch{ res.writeHead(502); res.end('backend not reachable'); }
          })();
          return;
        }
        if(pathname === '/') pathname = '/index.html';
        // prevent traversal
        const safe = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        let filePath = path.join(fallbackDir, safe);
        // if path is dir, try index.html
        try{ if(fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html'); }catch{}
        if(!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()){
          // SPA fallback: serve index.html for unknown routes (except static asset folders)
          if(!pathname.startsWith('/assets/') && !pathname.startsWith('/ammo/') && !pathname.startsWith('/models/') && !pathname.startsWith('/vmd/') && !pathname.startsWith('/backgrounds/')){
            filePath = fallbackIndex;
          } else { res.writeHead(404); res.end('not found'); return; }
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(filePath).pipe(res);
      }catch(e){ res.writeHead(500); res.end(String(e.message||e)); }
    });
    await new Promise((res, rej)=>{ fallbackServer.listen(port, '127.0.0.1', res); fallbackServer.on('error', rej); });
    console.log(`[fallback] serving dist over http://127.0.0.1:${port}`);
    await win.loadURL(`http://127.0.0.1:${port}/`);
    win.on('close', ()=>{ try{ fallbackServer.close(); }catch{} });
  }
  const useFallback = () => serveFallbackOverHttp();

  let useDev = false;
  let probeErr=null;
  let probeStatus=null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    tlog(`[probe] fetching devUrl=${devUrl} ...`);
    const r = await fetch(devUrl, { signal: ctrl.signal });
    clearTimeout(t);
    probeStatus=r.status;
    useDev = r.ok || r.status < 500;
    tlog(`[probe] devUrl=${devUrl} -> status=${r.status} ok=${r.ok} useDev=${useDev}`);
  } catch (e) { probeErr=e.message; terr(`[probe] devUrl=${devUrl} failed:`, e.message); useDev = false; }

  if (useDev){
    tlog(`[load] win.loadURL devUrl=${devUrl}`);
    try{ await win.loadURL(devUrl); tlog(`[load] devUrl loadURL succeeded`); }catch(e){ terr(`[load] devUrl loadURL failed:`, e.message, `fallback...`); await useFallback(); }
  } else {
    tlog(`[load] devUrl not reachable (status=${probeStatus} err=${probeErr}) -> fallback dist`);
    await useFallback();
  }

  win.webContents.on('did-fail-load', (_e, code, _desc, url) => {
    terr(`[webContents] did-fail-load (second handler) code=${code} desc=${_desc} url=${url}`);
    if (url.startsWith(devUrl) && (code === -102 || code === -105 || code === -3)){
      tlog(`[load] did-fail-load for devUrl -> useFallback`);
      useFallback();
    }
  });

  if(!win.listenerCount('closed')) win.on('closed', () => { tlog('[window] closed (second handler) -> win=null'); win = null; });
}

app.whenReady().then(async () => {
  tlog('[lifecycle] app.whenReady');
  try{ await startBackend(); }catch(e){ terr('[backend] startBackend throw', e.message) }
  try{ await createWindow(); tlog('[lifecycle] createWindow done', `win=${!!win} url=${win?.webContents?.getURL()||''}`); }catch(e){ terr('[window] createWindow failed', e.message, e.stack||'') }
  try {
    tray = new Tray(path.join(__dirname, '../public/favicon.svg'));
    const ctx = Menu.buildFromTemplate([
      { label: 'Show', click: () => win?.show() },
      { label: 'Toggle DevTools', click: () => win?.webContents.toggleDevTools() },
      { type:'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(ctx);
    tray.setToolTip('Waifu MMD');
    tray.on('click', () => win?.show());
    tlog('[tray] created');
  } catch(e){ terr('[tray] failed', e.message) }
  try { globalShortcut.register('Control+Shift+W', () => win?.show()); tlog('[shortcut] registered Control+Shift+W'); } catch(e){ terr('[shortcut] failed', e.message) }
  app.on('activate', () => { tlog('[lifecycle] activate'); if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  // also log when app becomes ready
  tlog('[lifecycle] whenReady block complete');
});

app.on('window-all-closed', () => { tlog('[lifecycle] window-all-closed'); if (process.platform !== 'darwin'){ tlog('[lifecycle] -> app.quit() (not darwin)'); app.quit(); } else tlog('[lifecycle] darwin -> keep alive'); });
app.on('will-quit', () => {
  tlog('[lifecycle] will-quit');
  if (backendProc){ tlog(`[backend] will-quit killing pid=${backendProc.pid}`); try { backendProc.kill(); } catch(e){ terr('[backend] kill failed', e.message)} }
  globalShortcut.unregisterAll();
  tlog('[lifecycle] will-quit done');
});
app.on('before-quit', () => tlog('[lifecycle] before-quit (second)'));

// IPC: wpkg
ipcMain.handle('wpkg:list', async () => {
  const dir = path.resolve(__dirname, '../../..', 'characters');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.wpkg')).map(f => {
    const full = path.join(dir, f);
    const st = fs.statSync(full);
    return { file: f, path: full, size: st.size, mtime: st.mtime.toISOString() };
  });
});
ipcMain.handle('wpkg:import', async (e, srcPath) => {
  const dest = path.resolve(__dirname, '../../..', 'characters', path.basename(srcPath));
  fs.copyFileSync(srcPath, dest);
  return { ok: true, dest };
});
ipcMain.handle('wpkg:dialog', async () => {
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Waifu Package', extensions: ['wpkg'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});
ipcMain.handle('vision:capture', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
    if (!sources.length) return null;
    return sources[0].thumbnail.toDataURL();
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('system:stats', async () => {
  try {
    const si = await import('systeminformation');
    const cpu = await si.default.currentLoad();
    const mem = await si.default.mem();
    const gfx = await si.default.graphics();
    return { cpu: cpu.currentLoad, mem, gfx };
  } catch {
    return { cpu: 0, mem: { total: 0, available: 0 }, note: 'install systeminformation for stats' };
  }
});
ipcMain.handle('window:resetBounds', async () => {
  try{ fs.unlinkSync(boundsPath()) }catch{}
  const def = defaultBounds()
  if(win && !win.isDestroyed()){
    win.setBounds({ x: def.x, y: def.y, width: def.width, height: def.height })
    if(win.isMaximized()) win.unmaximize()
    win.center()
  }
  return { ok:true, def }
});
