# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Root is an npm workspaces monorepo (`waifu-viewer`, `packages/*`, `apps/*`) plus a Python backend. `type: module` everywhere.

```bash
# Frontend — waifu-viewer (Vite + Three.js/MMD)
npm run dev              # vite dev on :5173 (proxies /health,/api/chat,/api/config -> :8000)
npm run build            # vite build -> waifu-viewer/dist
npm run preview          # vite preview
npm --prefix waifu-viewer run dev   # direct

# Desktop (Electron wrapper around waifu-viewer)
npm run desktop:dev      # vite + electron concurrently (waits for :5173)
npm run desktop:build    # builds waifu-viewer then electron-builder
npm --prefix apps/desktop run start          # electron . (built dist)
npm --prefix apps/desktop run start:headless # --no-sandbox --disable-gpu

# Backend (FastAPI)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set OPENROUTER_API_KEY and/or GROQ_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# health: http://localhost:8000/health  ws: ws://localhost:8000/ws/talk
docker build -t waifu-backend . && docker run -p 8000:8000 --env-file .env waifu-backend

# WPKG (character bundle) — .wpkg is a zip with STORE compression
npm run convert          # node scripts/convert-to-wpkg.mjs — packs MMD_Models_MiHoyo/* -> characters/*.wpkg
npm run wpkg:pack -- <srcDir> <out.wpkg>  # node scripts/pack-wpkg.mjs wrapper around packages/wpkg
npm --prefix packages/wpkg test  # node --test tests/*.test.js

# Single test (wpkg package only has tests)
node --test packages/wpkg/tests/<file>.test.js
```

No lint/test scripts at root or in waifu-viewer/apps/desktop beyond the above. Backend has no pytest config — `backend/tests/` exists but no runner is wired.

## Architecture

**waifu-viewer** (`waifu-viewer/src/`): Three.js + `MMDLoader`/`MMDAnimationHelper` + `ammo.js` (Bullet WASM). `main.js` owns scene/camera/renderer/lighting, model loading, physics sanitization (`sanitizePhysics`), and animation loop. Services:
- `services/waifu-client.js` — WebSocket client for `/ws/talk`
- `services/morph-driver.js` — `createMorphDriver(getMesh)` maps viseme frames to `morphTargetInfluences` (a/i/u/e/o + Japanese aliases あ/い/う/え/お), handles blinking/breathing/emotion bias
- `services/tools.js` — hitboxing (raycast zones), eye tracking, `hotSwapVmd`, affinity (`localStorage waifu:affinity`), prosody
- `editor/WpkgEditor.js` — in-app `.wpkg` editor overlay hitting `/api/wpkg/*`

`vite.config.js` defines `vmdLiveSync()` plugin: watches external `VMD_Animations/` folder, serves `/api/vmd` JSON + live `/vmd/*` files, copies to `public/vmd` and syncs `dist/vmd` on `closeBundle`. Frontend proxies `/health` and `/api/chat` to backend `:8000`.

**backend** (`backend/app/`): FastAPI (`main.py` + CORS). Routers:
- `api/chat.py` — `POST /api/chat` (non-streaming fallback)
- `api/health.py` — `GET /health`, `/api/config`
- `api/memory.py` — `/api/memory/search|store`, `/api/system/stats`, `/api/tools/list`
- `api/wpkg.py` — `/api/wpkg/list|info|validate|upload|create` (reads/writes `characters/*.wpkg`)
- `ws/talk.py` — `WS /ws/talk` pipeline: `chat` → `llm_start/token/end` → `tts_start` → `viseme+audio` chunks → `animation` → `done`; `stop` for barge-in (cancels asyncio task via `ws/manager.py`). `stt_chunk` reserved.

Services:
- `services/llm/` — `base.LLMProvider` with `OpenRouterProvider` (primary, `google/gemini-2.0-flash-001`) and `GroqProvider` (fallback, `llama-3.3-70b-versatile`); `factory.stream_with_fallback` + offline mock; `prompts.build_messages` + `parse_llm_json` yielding `schemas.LLMStructuredOutput` (text/emotion/gesture/intensity)
- `services/tts/` — `TTSProvider` → `KokoroProvider` (local, mocks sine if `kokoro` not installed), `ElevenLabsProvider`, `FishProvider`; `factory.get_tts_for_request(premium)`; `voices.resolve_voice` per character (ellen→af_sky/jf_alpha, jane→af_bella/jf_gongitsune, zhu→af_nicole/jf_sakura)
- `services/viseme/` — `mapper.phoneme_to_viseme` (ARPAbet→5 visemes) + `scheduler.phonemes_to_frames` (60fps coarticulated frames with lookahead/blend)
- `services/memory/chroma.py` — Chroma vector store (`memory/chroma`)
- `services/stt/` — Whisper + VAD
- `config.py` — `pydantic-settings` from `.env` (CORS_ORIGINS, ports, keys)

**packages/wpkg** (`packages/wpkg/src/`): Pure JS `.wpkg` pack/unpack (`jszip`, STORE). `manifest.js` validates spec v1 manifest (`spec`, `id`, `name`, `version`, `model.entry`, voice/prompts/motions/affinity) and `defaultManifest(id)`. `index.js` `pack(srcDir, out)` / `unpack(wpkg, destDir)` with 200MB limit and path-traversal guards.

**apps/desktop** (`apps/desktop/electron/`): Electron main process. `vite.config.js` points root at `../../waifu-viewer`. `main.js` auto-starts backend via `spawn(uvicorn)` (health-checks `:8000`, falls back to `:8001`), probes `VITE_DEV_SERVER_URL` before choosing `loadURL` vs `loadFile(dist)`. `preload.js` exposes context bridge.

**Data dirs**: `MMD_Models_MiHoyo/` (source PMX), `VMD_Animations/` (live VMD), `characters/` (built `.wpkg`), `waifu-viewer/public/vmd` (mirrored), `backend/memory/chroma`.
