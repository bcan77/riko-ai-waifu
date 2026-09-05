# FAQ — Riko AI Waifu

## General

**What is this?**
MMD viewer (Three.js `MMDLoader`/`MMDAnimationHelper` + `ammo.js` physics) coupled to a FastAPI backend that streams LLM → TTS → phoneme→viseme into morph targets. Characters are `.wpkg` bundles.

**Do I need to pay for LLM/TTS?**
No. OpenRouter free models (`poolside/laguna-s-2.1:free` etc.) and Kokoro local TTS (with sine mock fallback) let you run offline. Set `ELEVENLABS_API_KEY`/`FISH_API_KEY` only for premium voices.

## Setup

**Backend won't start — `ModuleNotFoundError: fastapi`?**
Activate venv: `source backend/.venv/bin/activate` then `pip install -r backend/requirements.txt`.

**Frontend shows `Booting…` forever / WebSocket fails?**
Backend not reachable at `ws://localhost:8000/ws/talk`. Check `uvicorn` on `:8000`, `CORS_ORIGINS` includes `http://localhost:5173`, and `waifu-viewer/vite.config.js` proxy target matches.

**Port 8000 busy?**
Electron auto-falls back to `:8001` (`apps/desktop/electron/main.js`). Or `lsof -i :8000` and kill, or change `PORT` in `backend/.env` and Vite proxy.

## Keys & Models

**Where do I set API keys?**
Either `backend/.env` (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `FISH_API_KEY`) or in-app **Settings → Keys** (`POST /api/keys` → persists to `backend/user_keys.json`). The latter hot-reloads without restart.

**Which OpenRouter models work?**
Default `google/gemini-2.0-flash-001` (not free); free examples: `poolside/laguna-s-2.1:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, etc. Full list in `waifu-viewer/src/settings/SettingsModal.js` `uh` array and `backend/.env.example`.

**How to change character voice?**
`VOICE_ELLEN/JANE/ZHU` in `.env` (`kokoro-af_sky` etc.) or `.wpkg` manifest `voice.en/ja`. Japanese auto-switches to `jf_alpha/jf_gongitsune/jf_sakura` when `KOKORO_LANG=ja` detected. Override per-request via `voice_id`.

## Assets

**Why is the repo ~460 MB?**
`characters/*.wpkg` (174 MB) + `waifu-viewer/public/models` (164 MB) + `backgrounds` (51 MB). Track with Git LFS if desired (`git lfs track "characters/*.wpkg" "waifu-viewer/public/models/**"`). Source `MMD_Models_MiHoyo/` was stripped — add locally to run `npm run convert`.

**Can I add my own character?**
Yes — create a folder with `model/model.pmx`, `motions/idle.vmd`, `manifest.json` (see `packages/wpkg/src/manifest.js`), then `npm run wpkg:pack -- <srcDir> <out.wpkg>` and drop into `characters/`. Or use in-app **WPKG Editor**.

**Backgrounds / VMD not appearing?**
`VMD_Animations/` → auto-synced to `public/vmd` and `GET /api/vmd` (see `vite.config.js:vmdLiveSync`). `backgrounds/` → `GET /api/backgrounds` and served at `/backgrounds/<path>` (`backgroundsLiveSync`). Ensure files are `.vmd`/`.fbx`/image and check `GET http://localhost:5173/api/backgrounds` (frontend-served, not backend).

## Runtime

**No audio but viseme moves?**
Kokoro not installed — `pip install kokoro-onnx` or set `TTS_PROVIDER=elevenlabs` + key. The mock still drives 60fps viseme frames for testing.

**Physics explodes / model falls through floor?**
Toggle **Settings → Physics/IK**, adjust `gravity` (−18 default), or **Reset Pose**. See `sanitizePhysics` in `waifu-viewer/src/main.js`.

**How to change affinity / hitbox / eye-tracking?**
Affinity via chat/hitbox (raycast zones in `services/tools.js`) persisted to `localStorage waifu:affinity`. Toggles in Settings (`hitboxing`, `eyeTracking`, `prosodyRate/Pitch`).

**How does streaming work?**
Client sends `{"type":"chat","text":"...","modelId":"ellen"}` over `WS /ws/talk`; server streams `llm_start` → `token` → `llm_end` (JSON `LLMStructuredOutput` with `text/emotion/gesture/intensity`) → `tts_start` → `viseme+audio` chunks → `animation` → `done`. Send `{"type":"stop"}` to barge-in (cancels `asyncio` task via `ws/manager.py`).

## Desktop

**Electron shows blank / `ERR_CONNECTION_REFUSED`?**
Vite dev server not ready. `npm run desktop:dev` uses `wait-on http://localhost:5173` — wait for `VITE v8.x ready` before Electron loads.

## Still stuck?

Check `backend/app/main.py`, `backend/app/ws/talk.py`, `waifu-viewer/vite.config.js` comments, and the browser console / `uvicorn --log-level debug`.
