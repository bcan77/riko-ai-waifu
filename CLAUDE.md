# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Root is an npm workspaces monorepo (`waifu-viewer`, `packages/*`, `apps/*`) plus a Python backend. `type: module` everywhere.

```bash
# One-command runner (recommended) — see run.sh:12
./run.sh                # desktop dev: vite :5173 + Electron (backend auto-spawned on :8000)
./run.sh --web          # web dev: uvicorn :8000 + vite :5173 (no Electron)
./run.sh --build        # build waifu-viewer/dist + electron-builder
./run.sh --headless     # desktop with --no-sandbox --disable-gpu (WSL/CI)
./run.sh --backend      # backend only
./run.sh --frontend     # vite only

# Frontend — waifu-viewer (Vite + Three.js/MMD) — package.json:6, waifu-viewer/vite.config.js:444
npm run dev              # vite dev on :5173 (proxies /health,/api/*,/ws -> :8000)
npm run build            # vite build -> waifu-viewer/dist
npm run preview          # vite preview
npm --prefix waifu-viewer run dev   # direct

# Versioning — VERSION + version.json are single source of truth — scripts/version.mjs:1
npm run version          # node scripts/version.mjs — print current version.json (10 fields)
npm run version:sync     # sync VERSION -> version.json + public/version.json + dist/version.json + package.json versions
npm run version:bump -- patch|minor|major|revision  # bump EU-0.3.9-01 -> EU-0.3.10-01
npm run version:check    # sync --write + cat version.json

# Watch rebuild — scripts/watch-rebuild.mjs:1
npm run watch:build      # watch waifu-viewer/src,backend/app,backgrounds,characters -> auto npm run build (debounced 1200ms)
npm run dev:watch        # watch:build & npm run dev concurrently

# Desktop (Electron wrapper around waifu-viewer) — apps/desktop/package.json:7
npm run desktop:dev      # concurrently vite + electron (wait-on :5173)
npm run desktop:build    # builds waifu-viewer then electron-builder
npm --prefix apps/desktop run start          # electron . (built dist)
npm --prefix apps/desktop run start:headless # --no-sandbox --disable-gpu

# Backend (FastAPI) — backend/app/main.py:1
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set OPENROUTER_API_KEY and/or GROQ_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# health: http://localhost:8000/health  ws: ws://localhost:8000/ws/talk
docker build -t waifu-backend . && docker run -p 8000:8000 --env-file .env waifu-backend

# WPKG (character bundle) — .wpkg is a zip with STORE compression — packages/wpkg/src/index.js:1
npm run convert          # node scripts/convert-to-wpkg.mjs — packs MMD_Models_MiHoyo/* -> characters/*.wpkg
npm run wpkg:pack -- <srcDir> <out.wpkg>  # node scripts/pack-wpkg.mjs wrapper around packages/wpkg
npm --prefix packages/wpkg test  # node --test tests/*.test.js

# Single test (wpkg package only has tests)
node --test packages/wpkg/tests/<file>.test.js
```

No lint/test scripts at root or in waifu-viewer/apps/desktop beyond the above. Backend has no pytest config — `backend/tests/` exists but no runner is wired.

## Architecture

**waifu-viewer** (`waifu-viewer/src/`): Three.js `0.160` + `MMDLoader`/`MMDAnimationHelper` + `ammo.js` (Bullet WASM via `/ammo/ammo.wasm.js`). `main.js:1` owns scene/camera/renderer/lighting, model+physics loading, face lightmap fix, and the animation loop.

- **Scene/setup** (`main.js:171`): `WebGLRenderer` (ACESFilmic, PCFSoftShadowMap), `PerspectiveCamera(38, ...)` at `-47.625,18.212,12.266` looking at `-20.48,15.605,5.917`, `OrbitControls` with damping. `background-manager.js` registers `bgSphere`, `BackgroundModelGroup`, `ground`, `camera`. Lighting is game-like high-key anime (ZZZ/Genshin): `hemisphere`, `key` (1.45), `fill` (0.68), `rim` (0.92), `back`, `ambient` (0.78), `faceLight` tracking `頭` bone via `bindHeadBone()` — `main.js:340`.
- **Model loading** (`main.js:694` `loadModel`): `ensureAmmo()` -> `sanitizePhysics()` (clamps restitution/friction/damping), `MMDLoader.load` with progress -> material fixes (gradientMap soft ramp 256px replaces harsh 32px `skin.bmp`, emissive 0.32 for face `颜`), `helper.add` with `PHYSICS_DEFAULTS` (`gravity -18`, `unitStep 1/60`), staggered `warmup(20)` to avoid blocking. Outfits: `MODELS[].outfits` + `resolveModelFile(modelId,outfitId)` + `selectOutfit()` — `main.js:65`.
- **VMD** (`main.js:93` `fetchVmdList` + `918` `loadAnimationForCurrentModel`): live-synced via `/api/vmd`; `hardResetPoseAndPhysics()` + `loader.loadAnimation` + `helper.add(animation:clip)`. Default `animId` is `default_pose` (FBX idle), `none` is static.
- **Freecam & debug** (`main.js:198`, `257`, `293`): WASD+Q/E, Shift/Ctrl, `F` toggle persisted `waifu:freecamEnabled`; `modelDebug`/`bgDebug`/`camDebug` persisted in `localStorage` (`waifu:modelDebug`, `waifu:bgDebug`, `waifu:camDebug`) and exposed as `window.modelDebug`, `window.__bgTroubleshoot`.
- **Settings binding** (`main.js:1188` `applySettingsPatch` + `settings/store.js:1`): `params` is a live facade over `settings/store.js:7` `DEFAULTS` (v11). Store sanitizes via `sanitize()`, migrates v5→v11, persists to `localStorage waifu:settings` + debounced `POST /api/settings` (`user_settings.json`), hydrates lazily from `GET /api/settings`. UI syncs sliders, shadows/ground/DPR toggles, etc.

Services (`waifu-viewer/src/services/`):
- `waifu-client.js:28` `WaifuClient` — WebSocket to `ws://host:8000/ws/talk` (vite proxy on :5173). Pipeline: `connect()` with `ping` every 20s + reconnect 1.8s, `sendChat(text)` → `{type:chat, model_id, llm_model, premium}`, `stop()` → `{type:stop}` barge-in. Handles `llm_start/token/end` → `tts_start` (PCM16 24kHz, `mock` flag) → `viseme` (frames) → `audio` (base64 PCM16, scheduled via `AudioContext` with `prosodyRate`/`prosodyPitch`) → `animation` → `done`/`interrupted`/`error`. `sampleViseme(ctxTime)` lerps timeline for `morph-driver` — `waifu-client.js:215`.
- `morph-driver.js:5` `createMorphDriver(getMesh)` — maps 5 visemes `a/i/u/e/o` + Japanese aliases `あ/い/う/え/お` to `morphTargetInfluences`, syncs alias pairs, adds `EMOTION_BIAS` and `まばたき` blinking (3.5-6s interval) + idle breathing — `morph-driver.js:51` `tick()`.
- `tools.js` — `setupHitboxing` (raycast zones → affinity bump), `setupEyeTracking`, `hotSwapVmd`, `applyProsody` (rate/pitch), `affinityCompat` (`localStorage waifu:affinity` alias to `store.affinity`).
- `background-manager.js:1` — registers `bgSphere/bgGroup/ground/camera`; `applyBackground(id, scene)` handles `gradient`/`solid`/image (`TextureLoader`) vs 3D model (`FBXLoader`/`GLTFLoader`/`OBJLoader` with `LoadingManager.setURLModifier` rewriting `*.fbm/*.png` → `Cozy-Living-Room/textures/` — `background-manager.js:124`). `fitAndPlaceModel` auto-scales to 24 units; `fetchBackgrounds()` probes `/api/backgrounds` → `/api/backgrounds/list` → `/backgrounds.json`.
- `version-manager.js` — polls `GET /api/version` (needsRebuild/hasDist) + listens for `version:update` HMR events from `versionSync()` plugin; shows gacha `buildBadge` and rebuild toast.

Settings UI (`waifu-viewer/src/settings/`): `store.js:7` `DEFAULTS` (modelId, outfitId, animId, physics/ik/gravity, key/fill/rim/back/ambient/exposure, shadows/ground, DPR/shadowRes, FOV/damping/distances, voices, premium/stt/bargeIn, panelCollapsed, `backgroundId: Cozy-Living-Room`). `SettingsModal.js` + `SetupWizard.js` (first-run onboarding, keys).

Editor (`waifu-viewer/src/editor/WpkgEditor.js`): in-app `.wpkg` editor overlay hitting `POST/GET /api/wpkg/*` (list/info/validate/upload/create).

`waifu-viewer/vite.config.js:444` defines three plugins + selective proxy (so Vite can serve even when backend is down):
- `versionSync():6` — reads `VERSION` + `version.json` → injects `__APP_VERSION__`/`__APP_BUILD_TIME__`, serves `/version.json` (no-store), watches `VERSION`/`version.json` → `version:update` HMR, `closeBundle` copies canonical `version.json` → `public/version.json` + `dist/version.json`.
- `vmdLiveSync():138` — watches `VMD_Animations/` → serves `/api/vmd|/api/vmd-list|/vmd-list.json` + `/vmd/<file>` (octet-stream), copies to `public/vmd` → `dist/vmd` on `closeBundle`, HMR `vmd:update`.
- `backgroundsLiveSync():239` — scans `backgrounds/` + `public/backgrounds` for models (`.fbx/.glb/.gltf/.obj/.pmx/.pmd`) vs images (`.jpg/.png/.webp/...`), serves `/api/backgrounds` + `/backgrounds/<path>` with `.jpg↔.jpeg` tolerant lookup + `.fbm` → `textures/` fallback, copies recursively to `dist/backgrounds` on `closeBundle`, HMR `backgrounds:update`.
- `server.proxy` — proxies `/health`, `/api/chat`, `/api/wpkg`, `/api/memory`, `/api/system`, `/api/tools`, `/api/keys`, `/api/settings`, `/api/version`, `/api/config`, `/ws` (ws) to `8000`; intentionally does **not** proxy `/api/backgrounds` or `/api/vmd` or `/version.json` so Vite middleware answers when backend is offline. `assetsInclude` covers `*.pmx/*.pmd/*.vmd/*.tga/*.bmp/*.spa/*.sph`.

**backend** (`backend/app/`): FastAPI (`main.py:33` + `CORSMiddleware` from `config.py:40` `cors_origins_list`). Routers:
- `api/health.py:7` — `GET /health` (provider/key presence), `GET /api/config`
- `api/chat.py:9` — `POST /api/chat` (non-streaming fallback via `complete_with_fallback`)
- `api/wpkg.py:9` — `GET /api/wpkg/list|info`, `POST /api/wpkg/validate|upload|create` (reads/writes `characters/*.wpkg`, outfits-aware)
- `api/memory.py:8` — `GET /api/memory/search`, `POST /api/memory/store`, `GET /api/system/stats` + `/api/tools/list` (via `services/tools/registry.py`)
- `api/keys.py:40` — `GET/POST /api/keys` (persist `user_keys.json`, mask, `openrouter_model`)
- `api/settings.py:131` — `GET/POST /api/settings` (sanitize + persist `user_settings.json`, merges partial patches)
- `api/backgrounds.py:95` — `GET /api/backgrounds|/api/backgrounds/list` (`list_backgrounds()` scans `backgrounds/` + `public/backgrounds`, model-first sort)
- `api/version.py:63` — `GET /api/version` + `/version.json` (reads `version.json`, computes `needsRebuild` by comparing `WATCH_DIRS` mtimes vs `version.json`/`dist` mtime, returns `hasDist`, `distMtime`, `serverTime`), `POST /api/version/rebuild` (`node scripts/version.mjs sync`)
- `ws/talk.py:16` `WS /ws/talk` — pipeline per `pipeline()`: `chat` → `llm_start/token/end` → `tts_start` → `viseme+audio` chunks → `animation` → `done`; `stop` cancels via `ws/manager.py`, `stt_chunk` reserved, `ping/pong` 20s heartbeat
- `main.py:53` inline `GET /backgrounds/{full_path:path}` — static with tolerant texture search (`_find_texture_tolerant` jpg↔jpeg + stem `rglob`), `.fbm` mapping, `204` for missing `roughness/metallic` so FBX still loads; `GET /` returns `{ok, ws, health}`.

Services:
- `services/llm/` — `base.LLMProvider` with `OpenRouterProvider` (primary, `openrouter_model` default `poolside/laguna-s-2.1:free` — `config.py:9`) and `GroqProvider` (fallback `llama-3.3-70b-versatile`); `factory.stream_with_fallback` / `complete_with_fallback` + offline mock; `prompts.build_messages` + `parse_llm_json` / `strip_thinking` / `_clean_text_field` yielding `schemas.LLMStructuredOutput` (`text/emotion/gesture/intensity`) — `ws/talk.py:16`.
- `services/tts/` — `TTSProvider` → `KokoroProvider` (local, mocks sine if `kokoro` not installed), `ElevenLabsProvider`, `FishProvider`; `factory.get_tts_for_request(premium, voice_id)`; `voices.resolve_voice` per character (`ellen→af_sky/jf_alpha`, `jane→af_bella/jf_gongitsune`, `zhu→af_nicole/jf_sakura`) + `is_japanese` lang auto-detect, `KOKORO_LANG=auto` — `config.py:19`.
- `services/viseme/` — `mapper.phoneme_to_viseme` (ARPAbet→5 visemes) + `scheduler.phonemes_to_frames` (60fps coarticulated frames with lookahead/blend) — `ws/talk.py:98`.
- `services/memory/chroma.py` — Chroma vector store (`memory/chroma`, `chroma_dir` — `config.py:32`)
- `services/stt/` — Whisper `small` (244MB) + Silero VAD (`whisper_model` — `config.py:31`)
- `config.py:4` `Settings` (`pydantic-settings` from `.env`, `extra=ignore`) — `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `FISH_API_KEY`, `VOICE_ELLEN/JANE/ZHU`, `PORT`, `CORS_ORIGINS`, `WS_HEARTBEAT_S`, `LOG_LEVEL`.

**packages/wpkg** (`packages/wpkg/src/`): Pure JS `.wpkg` pack/unpack (`jszip`, `STORE` — no compression). `manifest.js` validates spec v1 manifest (`spec`, `id`, `name`, `version`, `model.entry`, `voice`, `prompts.system_file`, `motions`, `affinity`, `outfits[]` + `outfit_default`) and `defaultManifest(id)`. `index.js:1` `pack(srcDir, out)` / `unpack(wpkg, destDir)` with 200MB limit and path-traversal guards (`..`, absolute). CLI wrappers: `scripts/pack-wpkg.mjs` and `scripts/convert-to-wpkg.mjs` (packs `MMD_Models_MiHoyo/*` → `characters/*.wpkg`).

**apps/desktop** (`apps/desktop/electron/`): Electron main process. `main.js:84` `isPortFree`/`waitForHealth`/`startBackend()` probes `:8000` (reuse if healthy, else `isPortFree` → `:8001` via `BACKEND_PORT`), bootstraps `backend/.venv` via `python3 -m venv` + `pip install` if missing, spawns `uvicorn app.main:app --host 127.0.0.1 --port <port> --app-dir backend`. `vite.config.js:1` sets `root: ../../waifu-viewer`, mirrors `versionSync`/`vmdLiveSync`/`backgroundsLiveSync` + `proxy` so Electron dev doesn't need a separate server. `createWindow():156` persists `window-bounds.json` (`defaultBounds()` 78% workArea, `saveBounds` debounced), probes `VITE_DEV_SERVER_URL` (default `http://localhost:5173`) — if reachable `loadURL(devUrl)` else `serveFallbackOverHttp()` — a local `http` server on random port that serves `waifu-viewer/dist` + proxies `/api/*`/`/health`/`/backgrounds/*`/`/version.json` to backend with tolerant texture lookup and `204` for roughness/metallic. `preload.js` exposes context bridge. IPC (`main.js:569`): `wpkg:list|import|dialog`, `vision:capture` (`desktopCapturer`), `system:stats`, `window:resetBounds`.

**Version & data**:

- `VERSION` (`EU-0.3.9-01`) — single source; format `CONTINENT-major.minor.patch-revision` (e.g. `EU-0.3.9-01`). `version.json` (10 fields: `version`, `build`, `commit`, `branch`, `dirty`, `buildTime`, `continent`, `versionNumber`, `revision`, `npmVersion`) generated by `scripts/version.mjs:93` `generateVersionJson()` (`sync()` copies to `waifu-viewer/public/version.json`, `waifu-viewer/dist/version.json`, and syncs `waifu-viewer/package.json:3` + `apps/desktop/package.json:3` `npmVersion` for `electron-builder`). Frontend reads via `version-manager.js` + `/api/version` (`needsRebuild`, `hasDist`); `run.sh` / `watch-rebuild` bump `buildTime` so clients see new builds.
- `scripts/`: `pack-wpkg.mjs` (CLI wrapper), `convert-to-wpkg.mjs` (MMD→wpkg batch), `version.mjs:141` (`bump`/`sync`/`get`), `watch-rebuild.mjs:1` (debounced auto-build on source mtime vs `dist`).
- Data dirs: `backgrounds/` (FBX rooms like `Cozy-Living-Room/` + textures; also `waifu-viewer/public/backgrounds` merged), `characters/` (built `.wpkg`), `MMD_Models_MiHoyo/` (source PMX), `VMD_Animations/` (live VMD → mirrored `waifu-viewer/public/vmd`), `waifu-viewer/public/vmd`, `backend/memory/chroma`, `backend/user_keys.json`, `backend/user_settings.json`.
