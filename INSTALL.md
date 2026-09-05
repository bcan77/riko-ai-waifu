> **Dil / Language:** 🇹🇷 Türkçe (bu dosya) | [🇬🇧 English](INSTALL.en.md)

# Kurulum Kılavuzu — Riko AI Waifu

Windows / Linux / macOS için adım adım. **Node ≥18** ve **Python 3.11+** gerektirir.

## 1) Ön Koşullar

```bash
node -v   # ≥18
python --version  # 3.11+
pip --version
git --version
```

Opsiyonel: `ffmpeg` (ses), `kokoro-onnx` bağımlılıkları, Electron derleme araçları (`npm run desktop:build` OS'e özel bağımlılıklar ister).

## 2) Klonla & JS bağımlılıklarını kur

```bash
git clone https://github.com/bcan77/riko-ai-waifu.git
cd riko-ai-waifu
npm install
```

Bu kök workspaceleri kurar: `waifu-viewer`, `packages/wpkg`, `apps/desktop`. Disk darsa masaüstünü atla: `npm install --workspace=waifu-viewer --workspace=@waifu/wpkg`.

## 3) Backend

```bash
cd backend
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
# Windows CMD: .venv\Scripts\activate.bat

pip install -r requirements.txt
cp .env.example .env
# .env düzenle — en az bir LLM anahtarı ayarla (README.md Yapılandırma bölümüne bak)
# OPENROUTER_API_KEY=sk-or-v1-...
# veya GROQ_API_KEY=gsk_...

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Doğrula: `http://localhost:8000/health` → `{"ok":true,...}`, `http://localhost:8000/api/config`.

> **Anahtar yok mu?** Backend yine de açılır — sohbet sahte bir mesaj döner ve TTS viseme'yi test edebilmen için sine sahte ses üretir.

### Docker alternatifi

```bash
cd backend
docker build -t waifu-backend .
docker run -p 8000:8000 --env-file .env waifu-backend
```

## 4) Frontend

**İkinci terminalde** repo kökünden:

```bash
npm run dev                  # waifu-viewer http://localhost:5173 üzerinde
# üretim:
npm run build                # → waifu-viewer/dist
npm run preview
```

Vite (`waifu-viewer/vite.config.js`) `/health`, `/api/chat|wpkg|memory|system|tools|keys|settings|version|config` ve `/ws` isteklerini `localhost:8000`'a proxy'ler. Backend'i açık tut.

## 5) Masaüstü (opsiyonel)

```bash
npm run desktop:dev          # vite + electron (:5173 bekler)
# yükleyici derle:
npm run desktop:build
# veya derlenmiş dist'i çalıştır:
npm --prefix apps/desktop run start
npm --prefix apps/desktop run start:headless   # --no-sandbox --disable-gpu
```

Electron (`apps/desktop/electron/main.js`) `uvicorn`'u otomatik olarak `:8000` (meşgulse `:8001`) üzerinde başlatır.

## 6) WPKG karakterler

Paketler `characters/*.wpkg` içinde önceden derlenmiş (174 MB). Uygulama içinde: **Panel → WPKG → İçe aktar/Doğrula/Kaydet**. Kaynaktan yeniden derlemek için:

```bash
# Yerelde MMD_Models_MiHoyo/ gerektirir (dahil değil — boyut için çıkarıldı)
npm run convert              # → characters/*.wpkg
npm run wpkg:pack -- <srcDir> <out.wpkg>
npm --prefix packages/wpkg test
```

## 7) Uçtan uca doğrulama

1. Backend logu `Uvicorn running on http://0.0.0.0:8000`, frontend `VITE v8.x ready`.
2. `http://localhost:5173` aç → durum `Booting…` → `Ready`.
3. Sohbet → `merhaba` → `llm_start` → akan tokenler → `tts_start` → ses + dudak senkronu (`a,i,u,e,o` 60fps) gör.
4. `GET http://localhost:8000/api/wpkg/list` `.wpkg` dosyalarını listeler.

## Güncelleme

```bash
git pull
npm install
pip install -r backend/requirements.txt
npm run version:check
```

## Sorun Giderme

`FAQ.md` ve `README.md#Sorun-Giderme` bölümlerine bak.

> **Dil:** [🇹🇷 Türkçe](INSTALL.md) | [🇬🇧 English](INSTALL.en.md) — İlk kurulumda Ayarlar → Dil üzerinden değiştirebilirsin.
