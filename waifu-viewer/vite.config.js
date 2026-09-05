import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

function versionSync(){
  const ROOT = path.resolve(process.cwd(), '..')
  const VERSION_FILE = path.join(ROOT, 'VERSION')
  const VERSION_JSON = path.join(ROOT, 'version.json')
  const PUBLIC_JSON = path.join(process.cwd(), 'public/version.json')
  function readVersion(){
    try{ return fs.readFileSync(VERSION_FILE,'utf8').trim() || '0.0.0' }catch{ return '0.0.0' }
  }
  function gen(){
    let commit='unknown', branch='unknown', dirty=false, build=0
    try{ commit = execSync('git rev-parse --short HEAD',{cwd:ROOT, stdio:['ignore','pipe','ignore']}).toString().trim() }catch{}
    try{ branch = execSync('git rev-parse --abbrev-ref HEAD',{cwd:ROOT, stdio:['ignore','pipe','ignore']}).toString().trim() }catch{}
    try{ dirty = execSync('git status --porcelain',{cwd:ROOT, stdio:['ignore','pipe','ignore']}).toString().trim().length>0 }catch{}
    try{ build = parseInt(execSync('git rev-list --count HEAD',{cwd:ROOT, stdio:['ignore','pipe','ignore']}).toString().trim(),10)||0 }catch{}
    const version = readVersion()
    const data = { version, build, commit, branch, dirty, buildTime: new Date().toISOString() }
    return data
  }
  function writePublic(data){
    try{ fs.mkdirSync(path.dirname(PUBLIC_JSON),{recursive:true}); fs.writeFileSync(PUBLIC_JSON, JSON.stringify(data,null,2)+'\n') }catch{}
    try{ fs.writeFileSync(VERSION_JSON, JSON.stringify(data,null,2)+'\n') }catch{}
  }
  // ensure on startup
  try{ const d=gen(); writePublic(d) }catch{}
  return {
    name: 'version-sync',
    config(){
      const d = gen()
      return { define: { '__APP_VERSION__': JSON.stringify(d.version), '__APP_BUILD_TIME__': JSON.stringify(d.buildTime) } }
    },
    configureServer(server){
      // watch VERSION file
      try{ server.watcher.add(VERSION_FILE) }catch{}
      // also watch version.json for external bumps
      try{ server.watcher.add(VERSION_JSON) }catch{}
      server.middlewares.use((req,res,next)=>{
        const url=(req.url||'').split('?')[0]
        if(url==='/version.json' || url==='/api/version'){
          try{
            const d = gen()
            // keep file fresh if VERSION changed outside
            writePublic(d)
            res.setHeader('Content-Type','application/json')
            res.setHeader('Cache-Control','no-store')
            res.end(JSON.stringify(d))
            return
          }catch(e){ next(); return }
        }
        next()
      })
      const notify=()=>{
        try{
          const d=gen(); writePublic(d)
          server.ws.send({ type:'custom', event:'version:update', data: d })
        }catch{}
      }
      // debounce FS events
      let t=null
      const debounced=()=>{ clearTimeout(t); t=setTimeout(notify, 400) }
      server.watcher.on('change', p=>{ try{ const abs=path.resolve(p); if(abs===path.resolve(VERSION_FILE)||abs===path.resolve(VERSION_JSON)) debounced() }catch{} })
      server.watcher.on('add', p=>{ try{ if(path.resolve(p)===path.resolve(VERSION_FILE)) debounced() }catch{} })
    },
    closeBundle(){
      try{
        const d=gen()
        writePublic(d)
        const distJson = path.resolve(process.cwd(),'dist/version.json')
        if(fs.existsSync(path.resolve(process.cwd(),'dist'))){
          fs.mkdirSync(path.dirname(distJson),{recursive:true})
          fs.writeFileSync(distJson, JSON.stringify(d,null,2)+'\n')
        }
      }catch{}
    }
  }
}

function vmdLiveSync() {
  const VMD_SRC = path.resolve(process.cwd(), '../VMD_Animations')
  const PUBLIC_VMD = path.resolve(process.cwd(), 'public/vmd')

  function listVmds() {
    if (!fs.existsSync(VMD_SRC)) return []
    return fs.readdirSync(VMD_SRC)
      .filter(f => f.toLowerCase().endsWith('.vmd'))
      .map(f => {
        const full = path.join(VMD_SRC, f)
        let size = 0
        let mtime = ''
        try {
          const st = fs.statSync(full)
          size = st.size
          mtime = st.mtime.toLocaleDateString()
        } catch {}
        const id = f.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase() || 'vmd'
        return {
          id,
          raw: f,
          name: path.basename(f, '.vmd'),
          file: `/vmd/${encodeURIComponent(f)}`,
          desc: `${(size / 1024 / 1024).toFixed(2)} MB${mtime ? ' • ' + mtime : ''}`,
          size,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  return {
    name: 'vmd-live-sync',
    configureServer(server) {
      if (!fs.existsSync(VMD_SRC)) {
        server.config.logger.warn(`[vmd-live-sync] VMD source folder not found: ${VMD_SRC}`)
        return
      }
      server.watcher.add(VMD_SRC)
      try {
        fs.mkdirSync(PUBLIC_VMD, { recursive: true })
        for (const f of fs.readdirSync(VMD_SRC).filter(f => f.toLowerCase().endsWith('.vmd'))) {
          const src = path.join(VMD_SRC, f)
          const dst = path.join(PUBLIC_VMD, f)
          if (!fs.existsSync(dst)) fs.copyFileSync(src, dst)
        }
      } catch {}

      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0].split('#')[0]
        if (url === '/api/vmd' || url === '/api/vmd-list' || url === '/vmd-list.json') {
          const list = listVmds()
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(list))
          return
        }
        if (url.startsWith('/vmd/')) {
          const rel = decodeURIComponent(url.slice('/vmd/'.length))
          if (rel.includes('..') || rel.includes('\0')) { next(); return }
          const fp = path.join(VMD_SRC, rel)
          if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            res.setHeader('Content-Type', 'application/octet-stream')
            res.setHeader('Cache-Control', 'no-store')
            fs.createReadStream(fp).pipe(res)
            return
          }
        }
        next()
      })

      const notify = () => {
        server.ws.send({ type: 'custom', event: 'vmd:update', data: listVmds() })
      }
      const onFsEvent = (p) => {
        try { if (path.resolve(p).startsWith(path.resolve(VMD_SRC))) notify() } catch {}
      }
      server.watcher.on('add', onFsEvent)
      server.watcher.on('unlink', onFsEvent)
      server.watcher.on('change', onFsEvent)
      try { fs.watch(VMD_SRC, { persistent: false }, () => notify()) } catch {}
    },
    closeBundle() {
      if (!fs.existsSync(VMD_SRC)) return
      const distVmd = path.resolve(process.cwd(), 'dist/vmd')
      try {
        if (!fs.existsSync(path.resolve(process.cwd(), 'dist'))) return
        fs.mkdirSync(distVmd, { recursive: true })
        const srcFiles = fs.readdirSync(VMD_SRC).filter(f => f.toLowerCase().endsWith('.vmd'))
        for (const f of srcFiles) fs.copyFileSync(path.join(VMD_SRC, f), path.join(distVmd, f))
        if (fs.existsSync(distVmd)) {
          for (const f of fs.readdirSync(distVmd)) {
            if (f.toLowerCase().endsWith('.vmd') && !srcFiles.includes(f)) {
              try { fs.unlinkSync(path.join(distVmd, f)) } catch {}
            }
          }
        }
      } catch (e) { console.warn('[vmd-live-sync] closeBundle copy failed:', e?.message || e) }
    },
  }
}

function backgroundsLiveSync() {
  const BG_SRC = path.resolve(process.cwd(), '../backgrounds')
  const PUBLIC_BG = path.resolve(process.cwd(), 'public/backgrounds')
  const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.bmp','.gif','.hdr','.exr'])
  const MODEL_EXTS = new Set(['.fbx','.glb','.gltf','.obj','.pmx','.pmd'])
  function scan(base) {
    const files = []
    if (!fs.existsSync(base)) return files
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else files.push(full)
      }
    }
    walk(base)
    return files
  }
  function listBgs() {
    const out = []
    const seen = new Set()
    const modelMap = new Map() // id -> { file: rel, ext }
    const modelTops = new Set()
    for (const base of [BG_SRC, PUBLIC_BG]) {
      if (!fs.existsSync(base)) continue
      for (const full of scan(base)) {
        const ext = path.extname(full).toLowerCase()
        if (!MODEL_EXTS.has(ext)) continue
        const rel = path.relative(base, full).split(path.sep).join('/')
        const top = rel.includes('/') ? rel.split('/')[0] : rel
        const bid = top
        if (bid) {
          if (rel.includes('/')) modelTops.add(top)
          if (!modelMap.has(bid)) modelMap.set(bid, { file: rel, ext })
        }
      }
    }
    for (const [bid, info] of modelMap) {
      if (seen.has(bid)) continue
      seen.add(bid)
      out.push({ id: bid, name: bid.replace(/[_-]+/g,' ').trim(), file: `/backgrounds/${info.file.split('/').map(encodeURIComponent).join('/')}`, type: 'model', ext: info.ext, modelFile: info.file })
    }
    for (const base of [BG_SRC, PUBLIC_BG]) {
      if (!fs.existsSync(base)) continue
      for (const full of scan(base)) {
        const ext = path.extname(full).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) continue
        const rel = path.relative(base, full).split(path.sep).join('/')
        if (seen.has(rel)) continue
        const top = rel.includes('/') ? rel.split('/')[0] : ''
        if (top && modelTops.has(top)) continue
        seen.add(rel)
        const name = path.basename(rel, path.extname(rel))
        const folder = path.posix.dirname(rel)
        const label = folder && folder!=='.' ? `${folder}/${name}` : name
        out.push({ id: rel, name: label, file: `/backgrounds/${rel.split('/').map(encodeURIComponent).join('/')}`, type: 'image', rel })
      }
    }
    out.sort((a,b)=> (a.type==='model'&&b.type!=='model'?-1:b.type==='model'&&a.type!=='model'?1: a.name.toLowerCase().localeCompare(b.name.toLowerCase())))
    return out
  }
  return {
    name: 'backgrounds-live-sync',
    configureServer(server) {
      if (!fs.existsSync(BG_SRC)) {
        try { fs.mkdirSync(BG_SRC, { recursive: true }) } catch {}
      }
      try { server.watcher.add(BG_SRC) } catch {}
      // ensure public/backgrounds exists
      try { fs.mkdirSync(PUBLIC_BG, { recursive: true }) } catch {}
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0].split('#')[0]
        if (url === '/api/backgrounds' || url === '/api/backgrounds/list') {
          res.setHeader('Content-Type','application/json')
          res.setHeader('Cache-Control','no-store')
          res.end(JSON.stringify(listBgs()))
          return
        }
        if (url.startsWith('/backgrounds/')) {
          const rel = decodeURIComponent(url.slice('/backgrounds/'.length))
          if (rel.includes('..') || rel.includes('\0')) { next(); return }
          function mimeFor(fp){
            const ext = path.extname(fp).toLowerCase()
            if(ext==='.png') return 'image/png'
            if(ext==='.jpg'||ext==='.jpeg') return 'image/jpeg'
            if(ext==='.webp') return 'image/webp'
            if(ext==='.bmp') return 'image/bmp'
            if(ext==='.gif') return 'image/gif'
            if(ext==='.glb') return 'model/gltf-binary'
            if(ext==='.gltf') return 'model/gltf+json'
            if(ext==='.fbx') return 'application/octet-stream'
            if(ext==='.obj') return 'text/plain'
            if(ext==='.hdr'||ext==='.exr') return 'application/octet-stream'
            return 'application/octet-stream'
          }
          function findTextureTolerant(fname){
            const alts = [fname]
            const low = fname.toLowerCase()
            if(low.endsWith('.jpg')) alts.push(fname.slice(0,-4)+'.jpeg')
            else if(low.endsWith('.jpeg')) alts.push(fname.slice(0,-5)+'.jpg')
            for(const base of [BG_SRC, PUBLIC_BG]){
              for(const q of alts){
                for(const probe of [path.join(base,'Cozy-Living-Room','textures',q), path.join(base,'textures',q), path.join(base,q)]){
                  if(fs.existsSync(probe) && fs.statSync(probe).isFile()) return probe
                }
              }
            }
            // stem fallback
            const stem = path.basename(fname, path.extname(fname)).toLowerCase()
            for(const base of [BG_SRC, PUBLIC_BG]){
              if(!fs.existsSync(base)) continue
              const walk=(d)=>{
                for(const e of fs.readdirSync(d,{withFileTypes:true})){
                  const f=path.join(d,e.name)
                  if(e.isDirectory()){ const r=walk(f); if(r) return r }
                  else if(path.basename(f, path.extname(f)).toLowerCase()===stem && ['.jpg','.jpeg','.png','.webp','.bmp'].includes(path.extname(f).toLowerCase())) return f
                }
                return null
              }
              try{ const r=walk(base); if(r) return r }catch{}
            }
            return null
          }
          // direct hit (with tolerant alternate ext)
          for (const base of [BG_SRC, PUBLIC_BG]) {
            let fp = path.join(base, rel)
            if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
              res.setHeader('Content-Type', mimeFor(fp))
              res.setHeader('Cache-Control','no-store')
              res.setHeader('Access-Control-Allow-Origin','*')
              fs.createReadStream(fp).pipe(res)
              return
            }
            // tolerant .jpg<->.jpeg for direct texture paths
            if(rel.toLowerCase().includes('textures')){
              const fname = path.basename(rel)
              const tol = findTextureTolerant(fname)
              if(tol){
                res.setHeader('Content-Type', mimeFor(tol))
                res.setHeader('Cache-Control','no-store')
                res.setHeader('Access-Control-Allow-Origin','*')
                fs.createReadStream(tol).pipe(res)
                return
              }
            }
          }
          // FBX .fbm fallback: "Cozy-Living-Room/source/2.fbm/X.png" -> textures/X.png (tolerant)
          if(rel.includes('.fbm')){
            const fname = path.basename(rel)
            const tol = findTextureTolerant(fname)
            if(tol){
              res.setHeader('Content-Type', mimeFor(tol))
              res.setHeader('Cache-Control','no-store')
              res.setHeader('Access-Control-Allow-Origin','*')
              fs.createReadStream(tol).pipe(res)
              return
            }
            // also try exact old probe for compat
            for(const base of [BG_SRC, PUBLIC_BG]){
              const probe = path.join(base, 'Cozy-Living-Room', 'textures', fname)
              if(fs.existsSync(probe) && fs.statSync(probe).isFile()){
                res.setHeader('Content-Type', mimeFor(probe))
                res.setHeader('Cache-Control','no-store')
                res.setHeader('Access-Control-Allow-Origin','*')
                fs.createReadStream(probe).pipe(res)
                return
              }
            }
          }
          // missing optional roughness/metallic -> 204 so FBX still loads cleanly
          if(rel.toLowerCase().includes('roughness') || rel.toLowerCase().includes('metallic')){
            res.writeHead(204, {'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'})
            res.end()
            return
          }
        }
        next()
      })
      const notify = () => server.ws.send({ type:'custom', event:'backgrounds:update', data: listBgs() })
      const onFsEvent = (p) => { try { if (path.resolve(p).startsWith(path.resolve(BG_SRC))) notify() } catch {} }
      server.watcher.on('add', onFsEvent)
      server.watcher.on('unlink', onFsEvent)
      server.watcher.on('change', onFsEvent)
      try { fs.watch(BG_SRC, { persistent:false, recursive:true }, ()=> notify()) } catch { try{ fs.watch(BG_SRC,{persistent:false},()=>notify())}catch{}}
    },
    closeBundle() {
      if (!fs.existsSync(BG_SRC)) return
      const distBg = path.resolve(process.cwd(), 'dist/backgrounds')
      try {
        if (!fs.existsSync(path.resolve(process.cwd(),'dist'))) return
        // recursive copy of all backgrounds (models + images + textures)
        const copyRec = (src, dst) => {
          fs.mkdirSync(dst, { recursive:true })
          for (const e of fs.readdirSync(src, {withFileTypes:true})) {
            const s = path.join(src, e.name); const d = path.join(dst, e.name)
            if (e.isDirectory()) copyRec(s,d)
            else fs.copyFileSync(s,d)
          }
        }
        if (fs.existsSync(BG_SRC)) copyRec(BG_SRC, distBg)
      } catch(e){ console.warn('[backgrounds] closeBundle failed', e?.message||e) }
    }
  }
}

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/health': 'http://localhost:8000',
      // selective /api proxy — do NOT proxy /api/backgrounds so Vite's
      // backgroundsLiveSync middleware can serve the JSON even when the
      // backend is offline (the #1 reason "background doesn't show up").
      '/api/chat': 'http://localhost:8000',
      '/api/wpkg': 'http://localhost:8000',
      '/api/memory': 'http://localhost:8000',
      '/api/system': 'http://localhost:8000',
      '/api/tools': 'http://localhost:8000',
      '/api/keys': 'http://localhost:8000',
      '/api/settings': 'http://localhost:8000',
      '/api/version': 'http://localhost:8000',
      '/api/config': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
  assetsInclude: ['**/*.pmx','**/*.pmd','**/*.vmd','**/*.tga','**/*.bmp','**/*.spa','**/*.sph'],
  plugins: [versionSync(), vmdLiveSync(), backgroundsLiveSync()],
})
