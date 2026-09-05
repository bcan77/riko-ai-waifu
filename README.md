# Riko AI Waifu — MMD Viewer + AI Companion

> Interactive MMD waifu (Ellen / Jane / Zhu) with real-time AI chat, lip-synced TTS and physics.  
> **Stack:** Three.js + MMDLoader + Bullet (`ammo.js`) · FastAPI + WebSockets · OpenRouter/Groq · Kokoro/ElevenLabs · 60fps viseme

![Version](https://img.shields.io/badge/version-EU--0.3.9--01-blue) ![Node](https://img.shields.io/badge/node-%3E%3D18-green) ![Python](https://img.shields.io/badge/python-3.11+-yellow) ![License](https://img.shields.io/badge/license-private-lightgrey)

**Live:** Frontend `http://localhost:5173` proxies `/health` `/api/*` `/ws` → Backend `http://localhost:8000` via `waifu-viewer/vite.config.js:388`.

---

## Features

- **MMD rendering** — PMX/PMA + VMD motions, morph lip-sync (`a,i,u,e,o`), blinking/breathing, emotion bias, physics sanitization (`waifu-viewer/src/main.js`)
- **Streaming AI** — `WS /ws/talk` → `llm_start/token/end` → `tts_start` → `viseme+audio` → `animation` → `done` with barge-in (`{"type":"stop"}`) — see `backend/app/ws/talk.py`
- **LLM fallback** — OpenRouter primary (`google/gemini-2.0-flash-001` default, `poolside/laguna-s-2.1:free` example) → Groq fallback, offline mock if no keys
- **TTS** — Kokoro local (offline sine mock if uninstalled) + ElevenLabs/Fish premium; per-character voices `ellen→af_sky/jf_alpha, jane→af_bella/jf_gongitsune, zhu→af_nicole/jf_sakura` (`backend/app/services/tts/voices.py`)
- **WPKG** — `.wpkg` = STORE-zip character bundle (`packages/wpkg/src/index.js`, `spec v1 manifest`). Editor overlay at `waifu-viewer/src/editor/WpkgEditor.js` hits `GET /api/wpkg/*`
- **Desktop** — Electron wrapper `apps/desktop/electron/main.js` auto-spawns `uvicorn` (health-checks `:8000` → `:8001`)
- **Backgrounds / VMD live-sync** — Vite plugins `vmdLiveSync()` + `backgroundsLiveSync()` serve `/api/vmd`, `/api/backgrounds`, `/backgrounds/*` with watch + HMR

---

## Installation

### Prerequisites

- **Node ≥18**, **Python 3.11+**, `pip`, `git`
- Optional: `ffmpeg` (audio), `kokoro` for local TTS, Electron deps for desktop

### 1) Clone

```bash
git clone https://github.com/bcan77/riko-ai-waifu.git
cd riko-ai-waifu
npm install                  # installs waifu-viewer + packages/wpkg + apps/desktop workspaces
```

> Repo is ~460 MB ( `characters/*.wpkg` 174 MB + `waifu-viewer/public/models` 164 MB + `backgrounds` 51 MB). If you use Git LFS, track them: `git lfs track "characters/*.wpkg" "waifu-viewer/public/models/**"` (hints in `.gitignore`).

### 2) Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # then edit .env — see Configuration below
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# verify: http://localhost:8000/health  http://localhost:8000/api/config
```

Keys can also be set **in-app** via Settings → Keys (`POST /api/keys` → persists to `backend/user_keys.json`, git-ignored) without restart.

### 3) Frontend

```bash
# from repo root
npm run dev                   # → http://localhost:5173
# or directly
npm --prefix waifu-viewer run dev
npm run build && npm run preview   # production build → waifu-viewer/dist
```

### 4) Desktop (optional)

```bash
npm run desktop:dev           # vite + electron concurrently
npm run desktop:build         # builds viewer then electron-builder
```

### Docker

```bash
cd backend
docker build -t waifu-backend .
docker run -p 8000:8000 --env-file .env waifu-backend
```

---

## Configuration

`backend/.env` (copy from `.env.example`, **never committed**):

| Key | Default | Notes |
|-----|---------|-------|
| `OPENROUTER_API_KEY` | *(empty)* | Primary LLM. Example models: `poolside/laguna-s-2.1:free`, `google/gemini-2.0-flash-001` |
| `OPENROUTER_MODEL` | `poolside/laguna-s-2.1:free` | Override per-request or via Settings → Keys |
| `GROQ_API_KEY` / `GROQ_MODEL` | `llama-3.3-70b-versatile` | Fallback provider (`LLM_FALLBACK=groq`) |
| `LLM_PROVIDER` / `LLM_FALLBACK` | `openrouter` / `groq` | `LLM_TIMEOUT_S=8` |
| `TTS_PROVIDER` | `kokoro` | `kokoro` (local, no key) | `elevenlabs` | `fish` |
| `ELEVENLABS_API_KEY` / `FISH_API_KEY` | | Premium TTS — also set via app |
| `VOICE_ELLEN/JANE/ZHU` | `af_sky/af_bella/af_nicole` | Kokoro voices; JA variants `jf_alpha/jf_gongitsune/jf_sakura` auto |
| `PORT` / `CORS_ORIGINS` | `8000` / `http://localhost:5173,http://127.0.0.1:5173` | For remote: `CORS_ORIGINS=https://your-viewer.example.com,...` |
| `WS_HEARTBEAT_S` / `LOG_LEVEL` | `20` / `info` | |

Frontend stores affinity, graphics, and keys in `localStorage` (`waifu:affinity`, etc.) — export/import via Settings.

---

## Usage

1. Start backend (`:8000`) and frontend (`:5173`).
2. Open `http://localhost:5173` → **Menu → Characters** to pick Ellen/Jane/Zhu + outfit.
3. **Chat bar** → type message (or `/wave`, `/dance`, `/idle`, `/vmd <name>`) → streams LLM tokens + viseme lip-sync + audio. Press **Stop** or type while speaking to barge-in.
4. **Settings (⚙ / Ctrl+,)** → Keys (OpenRouter/Groq/ElevenLabs/Fish), Graphics (DPR, shadows, FOV), App (physics, STT lang). Changes live-sync.
5. **.wpkg Editor** (Panel → WPKG) → Import/Validate/Save `.wpkg` bundles. List served from `characters/*.wpkg` via `GET /api/wpkg/list`.
6. **Backgrounds** (Panel → Scene → Background) → `backgrounds/` FBX/images, 3D rooms, Gradient/Solid. Drop files in `backgrounds/` — live without reload (dev) and persisted via `backgroundId`.

---

## Project Structure

```
waifu-viewer/         Vite + Three/MMD (src/main.js, services/waifu-client, morph-driver, tools, editor/WpkgEditor, settings/)
backend/app/          FastAPI (main.py, api/{health,chat,wpkg,memory,keys,settings,backgrounds,version}, ws/talk.py, services/{llm,tts,viseme,memory/stt}, config.py, models/schemas.py)
packages/wpkg/        .wpkg pack/unpack (src/index.js, src/manifest.js, jszip STORE, 200MB limit, path-traversal guard)
apps/desktop/         Electron (electron/main.js auto-starts uvicorn, preload.js bridge)
characters/*.wpkg     Built bundles (174 MB)
waifu-viewer/public/models/  Legacy PMX for direct boot (164 MB, mirrors characters)
backgrounds/          3D rooms + textures
VMD_Animations/       Live VMD source (default_pose.vmd etc.)
scripts/              pack-wpkg.mjs, convert-to-wpkg.mjs, version.mjs, watch-rebuild.mjs
VERSION / version.json  App version (EU-0.3.9-01) synced to public/version.json + /api/version
```

---

## FAQ

**Do I need API keys to run?**
No. Kokoro TTS works offline (sine mock if `kokoro` not installed) and the LLM returns a mock `{"text":"Hello! I am online — configure OPENROUTER_API_KEY..."} ` until you set a real key. Viseme pipeline is testable without keys.

**Which LLM/TTS providers are supported?**
LLM: OpenRouter (primary, `openrouter.py`) + Groq (fallback, `groq.py`) via `services/llm/factory.stream_with_fallback`. TTS: Kokoro (default, `services/tts/kokoro`), ElevenLabs, Fish (`factory.get_tts_for_request(premium)`). Set `TTS_PROVIDER` or toggle premium in Settings.

**Where are secrets stored?**
`backend/.env` (git-ignored), or Settings → Keys which `POST /api/keys` persists to `backend/user_keys.json` (also git-ignored) and hot-reloads `app.config.settings` without restart. Never commit `.env`/`user_keys.json`/`user_settings.json`.

**Why are `characters/*.wpkg` and `public/models` both large?**
Both are needed to boot: legacy `public/models` for `/models/Ellen Joe/艾莲.pmx` direct load, and `.wpkg` bundles for the in-app WPKG system. To slim the repo, enable Git LFS or uncomment the commented lines in `.gitignore` and rebuild models via `npm run convert` from a local `MMD_Models_MiHoyo/` source (not included).

**Electron doesn't start / port busy?**
`apps/desktop/electron/main.js` probes `:8000`, falls back to `:8001`, waits for `VITE_DEV_SERVER_URL` before `loadURL` vs `loadFile(dist)`. Check `http://localhost:8000/health`. Use `npm --prefix apps/desktop run start:headless -- --no-sandbox --disable-gpu` if needed.

**Background / VMD not showing?**
Vite plugins in `vite.config.js` intentionally proxy `/api/backgrounds` locally (not to backend) so the picker works offline. Drop `.fbx/.glb` or images into `backgrounds/`; they appear at `GET /api/backgrounds` and are served at `/backgrounds/<path>`. VMDs go in `VMD_Animations/` (→ `/api/vmd` + `/vmd/*`).

**Common build errors?**
- `ammo.js` WASM 404 → ensure `waifu-viewer/public/ammo/{ammo.js,ammo.wasm.*}` present (already included).
- `uvicorn` not found → activate `backend/.venv`.
- `ws` connect fails → backend not on `:8000` or `CORS_ORIGINS` mismatch.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Blank viewer / 404 on `/models/...` | `waifu-viewer/public/models` missing — re-add or `npm run convert` with `MMD_Models_MiHoyo/` |
| `health` works but chat stalls | `OPENROUTER_API_KEY` empty or model rate-limited — try `poolside/laguna-s-2.1:free` or set `GROQ_API_KEY` as fallback |
| No audio / viseme only | Kokoro not installed — pip `kokoro-onnx` or switch to `TTS_PROVIDER=elevenlabs` |
| Desktop white screen | `vite` not on `:5173` yet — `npm run desktop:dev` waits via `wait-on`; check `VITE_DEV_SERVER_URL` |

More: see `backend/README.md`, `INSTALL.md`, `FAQ.md`, and `backend/app/ws/talk.py` for the streaming protocol.

## Contributing

PRs welcome. No `CONTRIBUTING.md` yet — run `npm run version:check` and `npm --prefix packages/wpkg test` before submitting.

## Credits

MMD models: MiHoYo/Zenless Zone Zero fan edits (not redistributed as source here; only built `.wpkg`/`public/models`). Three.js `MMDLoader` / `MMDAnimationHelper`, `ammo.js` (Bullet). LLM via OpenRouter/Groq, TTS via Kokoro/ElevenLabs/Fish.

---

> **Note on GitHub "About" section:** The short repo *description*, website and topics shown at the top of the GitHub page cannot be edited via files — update them at `https://github.com/bcan77/riko-ai-waifu` → ⚙️ **Edit** next to *About* (or `gh repo edit bcan77/riko-ai-waifu --description "..." --add-topic ...` if `gh` is authenticated). This README controls the in-page documentation only.
