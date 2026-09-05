# Riko AI Waifu — MMD Viewer + AI Companion

> **Dil / Language:** 🇹🇷 Türkçe (bu dosya) | [🇬🇧 English](README.en.md)

> Gerçek zamanlı AI sohbet, dudak senkronlu TTS ve fizikli interaktif MMD waifu (Ellen / Jane / Zhu).  
> **Teknolojiler:** Three.js + MMDLoader + Bullet (`ammo.js`) · FastAPI + WebSockets · OpenRouter/Groq · Kokoro/ElevenLabs · 60fps viseme

![Version](https://img.shields.io/badge/version-EU--0.3.9--01-blue) ![Node](https://img.shields.io/badge/node-%3E%3D18-green) ![Python](https://img.shields.io/badge/python-3.11+-yellow) ![License](https://img.shields.io/badge/license-private-lightgrey)

**Canlı:** Frontend `http://localhost:5173` → `/health` `/api/*` `/ws` isteklerini `waifu-viewer/vite.config.js:388` üzerinden Backend `http://localhost:8000` adresine proxy'ler.

---

## Özellikler

- **MMD render** — PMX/PMA + VMD hareketleri, morph dudak senkronizasyonu (`a,i,u,e,o`), göz kırpma/nefes alma, duygu eğilimi, fizik sanitizasyonu (`waifu-viewer/src/main.js`)
- **Akışkan AI** — `WS /ws/talk` → `llm_start/token/end` → `tts_start` → `viseme+audio` → `animation` → `done` ve barge-in (`{"type":"stop"}`) — bkz. `backend/app/ws/talk.py`
- **LLM yedek sistemi** — OpenRouter birincil (`google/gemini-2.0-flash-001` varsayılan, `poolside/laguna-s-2.1:free` örneği) → Groq yedek, anahtar yoksa çevrimdışı sahte mod
- **TTS** — Kokoro yerel (kurulu değilse çevrimdışı sine sahte) + ElevenLabs/Fish premium; karakter başına sesler `ellen→af_sky/jf_alpha, jane→af_bella/jf_gongitsune, zhu→af_nicole/jf_sakura` (`backend/app/services/tts/voices.py`)
- **WPKG** — `.wpkg` = STORE-zip karakter paketi (`packages/wpkg/src/index.js`, `spec v1 manifest`). Editor `waifu-viewer/src/editor/WpkgEditor.js` üzerinden `GET /api/wpkg/*` istekleri
- **Masaüstü** — Electron sarmalayıcı `apps/desktop/electron/main.js` otomatik `uvicorn` başlatır (sağlık kontrolü `:8000` → `:8001`)
- **Arkaplan / VMD canlı senkron** — Vite eklentileri `vmdLiveSync()` + `backgroundsLiveSync()` ile `/api/vmd`, `/api/backgrounds`, `/backgrounds/*` izleme + HMR desteği

---

## Kurulum

### Ön Koşullar

- **Node ≥18**, **Python 3.11+**, `pip`, `git`
- Opsiyonel: `ffmpeg` (ses), yerel TTS için `kokoro`, masaüstü için Electron bağımlılıkları

### 1) Klonla

```bash
git clone https://github.com/bcan77/riko-ai-waifu.git
cd riko-ai-waifu
npm install                  # waifu-viewer + packages/wpkg + apps/desktop workspacelerini kurar
```

> Repo ~460 MB (`characters/*.wpkg` 174 MB + `waifu-viewer/public/models` 164 MB + `backgrounds` 51 MB). Git LFS kullanıyorsan: `git lfs track "characters/*.wpkg" "waifu-viewer/public/models/**"` (ipuçları `.gitignore` içinde).

### 2) Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # sonra .env dosyasını düzenle — aşağıdaki Yapılandırma bölümüne bak
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# doğrulama: http://localhost:8000/health  http://localhost:8000/api/config
```

Anahtarlar ayrıca **uygulama içinden** Ayarlar → Anahtarlar (`POST /api/keys` → `backend/user_keys.json` içine kaydeder, git'te yok sayılır) yoluyla yeniden başlatmadan ayarlanabilir.

### 3) Frontend

```bash
# repo kökünden
npm run dev                   # → http://localhost:5173
# veya doğrudan
npm --prefix waifu-viewer run dev
npm run build && npm run preview   # üretim derlemesi → waifu-viewer/dist
```

### 4) Masaüstü (opsiyonel)

```bash
npm run desktop:dev           # vite + electron eşzamanlı
npm run desktop:build         # viewer'ı derler sonra electron-builder
```

### Docker

```bash
cd backend
docker build -t waifu-backend .
docker run -p 8000:8000 --env-file .env waifu-backend
```

---

## Yapılandırma

`backend/.env` (`.env.example` dosyasından kopyala, **asla commit'leme**):

| Anahtar | Varsayılan | Notlar |
|-----|---------|-------|
| `OPENROUTER_API_KEY` | *(boş)* | Birincil LLM. Örnek modeller: `poolside/laguna-s-2.1:free`, `google/gemini-2.0-flash-001` |
| `OPENROUTER_MODEL` | `poolside/laguna-s-2.1:free` | İstek başına veya Ayarlar → Anahtarlar üzerinden değiştirilebilir |
| `GROQ_API_KEY` / `GROQ_MODEL` | `llama-3.3-70b-versatile` | Yedek sağlayıcı (`LLM_FALLBACK=groq`) |
| `LLM_PROVIDER` / `LLM_FALLBACK` | `openrouter` / `groq` | `LLM_TIMEOUT_S=8` |
| `TTS_PROVIDER` | `kokoro` | `kokoro` (yerel, anahtar gerekmez) | `elevenlabs` | `fish` |
| `ELEVENLABS_API_KEY` / `FISH_API_KEY` | | Premium TTS — uygulama içinden de ayarlanabilir |
| `VOICE_ELLEN/JANE/ZHU` | `af_sky/af_bella/af_nicole` | Kokoro sesleri; JA varyantları `jf_alpha/jf_gongitsune/jf_sakura` otomatik |
| `PORT` / `CORS_ORIGINS` | `8000` / `http://localhost:5173,http://127.0.0.1:5173` | Uzak için: `CORS_ORIGINS=https://your-viewer.example.com,...` |
| `WS_HEARTBEAT_S` / `LOG_LEVEL` | `20` / `info` | |

Frontend yakınlık (affinity), grafik ve anahtarları `localStorage` içinde saklar (`waifu:affinity` vb.) — Ayarlar üzerinden dışa/içe aktarılabilir.

---

## Kullanım

1. Backend (`:8000`) ve frontend (`:5173`) başlat.
2. `http://localhost:5173` aç → **Menü → Karakterler** ile Ellen/Jane/Zhu + kıyafet seç.
3. **Sohbet çubuğu** → mesaj yaz (veya `/wave`, `/dance`, `/idle`, `/vmd <isim>`) → LLM tokenleri + viseme dudak senkronu + ses akışı. **Durdur** tuşuna bas veya konuşurken yazarak barge-in yap.
4. **Ayarlar (⚙ / Ctrl+,)** → Anahtarlar (OpenRouter/Groq/ElevenLabs/Fish), Grafikler (DPR, gölgeler, FOV), Uygulama (fizik, STT dili, **Dil / Language**). Değişiklikler anında uygulanır.
5. **.wpkg Editörü** (Panel → WPKG) → `.wpkg` paketlerini İçe aktar/Doğrula/Kaydet. Liste `characters/*.wpkg` üzerinden `GET /api/wpkg/list` ile sunulur.
6. **Arkaplanlar** (Panel → Scene → Background) → `backgrounds/` FBX/resimler, 3D odalar, Gradient/Solid. Dosyaları `backgrounds/` içine at — yeniden yüklemeden canlı görünür (dev) ve `backgroundId` ile kalıcı olur.

---

## Proje Yapısı

```
waifu-viewer/         Vite + Three/MMD (src/main.js, services/waifu-client, morph-driver, tools, editor/WpkgEditor, settings/)
backend/app/          FastAPI (main.py, api/{health,chat,wpkg,memory,keys,settings,backgrounds,version}, ws/talk.py, services/{llm,tts,viseme,memory/stt}, config.py, models/schemas.py)
packages/wpkg/        .wpkg paketleme/açma (src/index.js, src/manifest.js, jszip STORE, 200MB limit, path-traversal koruması)
apps/desktop/         Electron (electron/main.js uvicorn'u otomatik başlatır, preload.js köprüsü)
characters/*.wpkg     Derlenmiş paketler (174 MB)
waifu-viewer/public/models/  Doğrudan başlatma için legacy PMX (164 MB, characters ile aynı)
backgrounds/          3D odalar + dokular
VMD_Animations/       Canlı VMD kaynağı (default_pose.vmd vb.)
scripts/              pack-wpkg.mjs, convert-to-wpkg.mjs, version.mjs, watch-rebuild.mjs
VERSION / version.json  Uygulama sürümü (EU-0.3.9-01) public/version.json + /api/version ile senkron
```

---

## SSS

**API anahtarları olmadan çalışır mı?**
Evet. Kokoro TTS çevrimdışı çalışır (`kokoro` kurulu değilse sine sahte) ve LLM gerçek bir anahtar ayarlayana kadar sahte `{"text":"Hello! I am online — configure OPENROUTER_API_KEY..."} ` döner. Viseme akışı anahtarsız da test edilebilir.

**Hangi LLM/TTS sağlayıcıları destekleniyor?**
LLM: OpenRouter (birincil, `openrouter.py`) + Groq (yedek, `groq.py`) via `services/llm/factory.stream_with_fallback`. TTS: Kokoro (varsayılan, `services/tts/kokoro`), ElevenLabs, Fish (`factory.get_tts_for_request(premium)`). `TTS_PROVIDER` ayarla veya Ayarlar içinde premium'u değiştir.

**Gizli anahtarlar nerede saklanıyor?**
`backend/.env` (git'te yok sayılır), veya Ayarlar → Anahtarlar ile `POST /api/keys` → `backend/user_keys.json` (o da git'te yok) ve `app.config.settings` yeniden başlatmadan hot-reload olur. `.env`/`user_keys.json`/`user_settings.json` asla commit'leme.

**Neden `characters/*.wpkg` ve `public/models` ikisi de büyük?**
İkisi de açılış için gerekli: legacy `public/models` → `/models/Ellen Joe/艾莲.pmx` doğrudan yükleme, ve `.wpkg` paketleri uygulama içi WPKG sistemi için. Repoyu küçültmek için Git LFS aktif et veya `.gitignore` içindeki yorum satırlarını açıp `npm run convert` ile yerel `MMD_Models_MiHoyo/` kaynağından yeniden oluştur (dahil değil).

**Electron başlamıyor / port meşgul?**
`apps/desktop/electron/main.js` `:8000` portunu dener, meşgulse `:8001` kullanır, `VITE_DEV_SERVER_URL` hazır olana kadar `loadURL` vs `loadFile(dist)` bekler. `http://localhost:8000/health` kontrol et. Gerekirse `npm --prefix apps/desktop run start:headless -- --no-sandbox --disable-gpu` kullan.

**Arkaplan / VMD görünmüyor?**
`vite.config.js` içindeki Vite eklentileri `/api/backgrounds` isteklerini bilerek yerel proxy'ler (backend'e değil) böylece seçici çevrimdışı da çalışır. `.fbx/.glb` veya resimleri `backgrounds/` içine at; `GET /api/backgrounds` ve `/backgrounds/<path>` altında görünür. VMD'ler `VMD_Animations/` içine (→ `/api/vmd` + `/vmd/*`).

**Yaygın derleme hataları?**
- `ammo.js` WASM 404 → `waifu-viewer/public/ammo/{ammo.js,ammo.wasm.*}` mevcut olduğundan emin ol (zaten dahil).
- `uvicorn` bulunamadı → `backend/.venv` aktif et.
- `ws` bağlantı hatası → backend `:8000` üzerinde değil veya `CORS_ORIGINS` uyuşmuyor.

---

## Sorun Giderme

| Belirti | Kontrol |
|---------|-------|
| Boş viewer / `/models/...` 404 | `waifu-viewer/public/models` eksik — yeniden ekle veya `MMD_Models_MiHoyo/` ile `npm run convert` çalıştır |
| `health` çalışıyor ama sohbet takılıyor | `OPENROUTER_API_KEY` boş veya model rate-limited — `poolside/laguna-s-2.1:free` dene veya yedek olarak `GROQ_API_KEY` ayarla |
| Ses yok / sadece viseme var | Kokoro kurulu değil — `kokoro-onnx` pip ile kur veya `TTS_PROVIDER=elevenlabs` yap |
| Masaüstü beyaz ekran | `vite` henüz `:5173` üzerinde değil — `npm run desktop:dev` `wait-on` ile bekler; `VITE_DEV_SERVER_URL` kontrol et |

Daha fazlası: `backend/README.md`, `INSTALL.md`, `FAQ.md` ve akış protokolü için `backend/app/ws/talk.py` dosyalarına bak.

## Katkıda Bulunma

PR'ler memnuniyetle karşılanır. Henüz `CONTRIBUTING.md` yok — göndermeden önce `npm run version:check` ve `npm --prefix packages/wpkg test` çalıştır.

## Krediler

MMD modelleri: MiHoYo/Zenless Zone Zero fan düzenlemeleri (burada kaynak olarak yeniden dağıtılmıyor; sadece derlenmiş `.wpkg`/`public/models`). Three.js `MMDLoader` / `MMDAnimationHelper`, `ammo.js` (Bullet). LLM OpenRouter/Groq üzerinden, TTS Kokoro/ElevenLabs/Fish üzerinden.

---

> **GitHub "About" bölümü notu:** GitHub sayfasının üstündeki kısa repo *açıklaması*, web sitesi ve konular dosyalar üzerinden düzenlenemez — `https://github.com/bcan77/riko-ai-waifu` → ⚙️ **Edit** butonundan *About* yanından (veya `gh` giriş yaptıysa `gh repo edit bcan77/riko-ai-waifu --description "..." --add-topic ...`) güncelle. Bu README sadece sayfa içi dökümantasyonu kontrol eder.
