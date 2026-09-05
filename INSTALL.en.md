> **Language / Dil:** [🇹🇷 Türkçe](INSTALL.md) | 🇬🇧 English (this file)

# Install Guide — Riko AI Waifu

Step-by-step for Windows / Linux / macOS. Requires **Node ≥18** and **Python 3.11+**.

## 1) Prerequisites

```bash
node -v   # ≥18
python --version  # 3.11+
pip --version
git --version
```

Optional: `ffmpeg` (audio), `kokoro-onnx` deps, Electron build tools (`npm run desktop:build` needs OS-native deps).

## 2) Clone & install JS deps

```bash
git clone https://github.com/bcan77/riko-ai-waifu.git
cd riko-ai-waifu
npm install
```

This installs root workspaces: `waifu-viewer`, `packages/wpkg`, `apps/desktop`. If disk-tight, skip desktop: `npm install --workspace=waifu-viewer --workspace=@waifu/wpkg`.

## 3) Backend

```bash
cd backend
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
# Windows CMD: .venv\Scripts\activate.bat

pip install -r requirements.txt
cp .env.example .env
# Edit .env — at minimum set one LLM key (see Configuration in README.md)
# OPENROUTER_API_KEY=sk-or-v1-...
# or GROQ_API_KEY=gsk_...

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify: `http://localhost:8000/health` → `{"ok":true,...}`, `http://localhost:8000/api/config`.

> **No key?** The backend still boots — chat returns a mock message and TTS emits a sine mock so you can test viseme without credentials.

### Docker alternative

```bash
cd backend
docker build -t waifu-backend .
docker run -p 8000:8000 --env-file .env waifu-backend
```

## 4) Frontend

In a **second terminal** from repo root:

```bash
npm run dev                  # waifu-viewer on http://localhost:5173
# production:
npm run build                # → waifu-viewer/dist
npm run preview
```

Vite (`waifu-viewer/vite.config.js`) proxies `/health`, `/api/chat|wpkg|memory|system|tools|keys|settings|version|config`, and `/ws` to `localhost:8000`. Keep backend running.

## 5) Desktop (optional)

```bash
npm run desktop:dev          # vite + electron (waits for :5173)
# build installer:
npm run desktop:build
# or run built dist:
npm --prefix apps/desktop run start
npm --prefix apps/desktop run start:headless   # --no-sandbox --disable-gpu
```

Electron (`apps/desktop/electron/main.js`) auto-spawns `uvicorn` on `:8000` (or `:8001` if busy).

## 6) WPKG characters

Bundles are prebuilt in `characters/*.wpkg` (174 MB). In-app: **Panel → WPKG → Import/Validate/Save**. To rebuild from source:

```bash
# requires MMD_Models_MiHoyo/ locally (not included — stripped for size)
npm run convert              # → characters/*.wpkg
npm run wpkg:pack -- <srcDir> <out.wpkg>
npm --prefix packages/wpkg test
```

## 7) Verify end-to-end

1. Backend logs `Uvicorn running on http://0.0.0.0:8000`, frontend `VITE v8.x ready`.
2. Open `http://localhost:5173` → status `Booting…` → `Ready`.
3. Chat → `hello` → see `llm_start` → streaming tokens → `tts_start` → audio + lip-sync (`a,i,u,e,o` at 60fps).
4. `GET http://localhost:8000/api/wpkg/list` lists `.wpkg` files.

## Updating

```bash
git pull
npm install
pip install -r backend/requirements.txt
npm run version:check
```

## Troubleshooting

See `FAQ.md` and `README.md#Troubleshooting`.
