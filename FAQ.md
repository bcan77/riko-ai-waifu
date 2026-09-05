> **Dil / Language:** 🇹🇷 Türkçe (bu dosya) | [🇬🇧 English](FAQ.en.md)

# SSS — Riko AI Waifu

## Genel

**Bu nedir?**
MMD görüntüleyici (Three.js `MMDLoader`/`MMDAnimationHelper` + `ammo.js` fizik) ile FastAPI backend'in birleşimi; LLM → TTS → fonem→viseme akışını morph targetlara aktarır. Karakterler `.wpkg` paketleridir.

**LLM/TTS için ödeme yapmam gerekiyor mu?**
Hayır. OpenRouter ücretsiz modeller (`poolside/laguna-s-2.1:free` vb.) ve Kokoro yerel TTS (sine sahte yedek ile) çevrimdışı çalışmana izin verir. Sadece premium sesler için `ELEVENLABS_API_KEY`/`FISH_API_KEY` ayarla.

## Kurulum

**Backend başlamıyor — `ModuleNotFoundError: fastapi`?**
Venv'i aktif et: `source backend/.venv/bin/activate` sonra `pip install -r backend/requirements.txt`.

**Frontend `Booting…` takılı kalıyor / WebSocket başarısız?**
Backend `ws://localhost:8000/ws/talk` adresinde erişilemiyor. `uvicorn` `:8000` üzerinde mi, `CORS_ORIGINS` `http://localhost:5173` içeriyor mu ve `waifu-viewer/vite.config.js` proxy hedefi doğru mu kontrol et.

**Port 8000 meşgul?**
Electron otomatik olarak `:8001`'e geçer (`apps/desktop/electron/main.js`). Veya `lsof -i :8000` ile öldür, ya da `backend/.env` içinde `PORT` ve Vite proxy'yi değiştir.

## Anahtarlar & Modeller

**API anahtarlarını nerede ayarlarım?**
Ya `backend/.env` (`OPENROUTER_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `FISH_API_KEY`) ya da uygulama içi **Ayarlar → Anahtarlar** (`POST /api/keys` → `backend/user_keys.json` içine kaydeder). İkincisi yeniden başlatmadan hot-reload olur.

**Hangi OpenRouter modelleri çalışır?**
Varsayılan `google/gemini-2.0-flash-001` (ücretsiz değil); ücretsiz örnekler: `poolside/laguna-s-2.1:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` vb. Tam liste `waifu-viewer/src/settings/SettingsModal.js` `FREE_MODELS` dizisinde ve `backend/.env.example` içinde.

**Karakter sesini nasıl değiştiririm?**
`.env` içinde `VOICE_ELLEN/JANE/ZHU` (`kokoro-af_sky` vb.) veya `.wpkg` manifest `voice.en/ja`. `KOKORO_LANG=ja` algılandığında Japonca otomatik `jf_alpha/jf_gongitsune/jf_sakura` geçer. İstek başına `voice_id` ile ezebilirsin.

## Varlıklar

**Neden repo ~460 MB?**
`characters/*.wpkg` (174 MB) + `waifu-viewer/public/models` (164 MB) + `backgrounds` (51 MB). İstersen Git LFS ile takip et (`git lfs track "characters/*.wpkg" "waifu-viewer/public/models/**"`). Kaynak `MMD_Models_MiHoyo/` boyut için çıkarıldı — `npm run convert` çalıştırmak için yerel olarak ekle.

**Kendi karakterimi ekleyebilir miyim?**
Evet — `model/model.pmx`, `motions/idle.vmd`, `manifest.json` içeren bir klasör oluştur (bkz. `packages/wpkg/src/manifest.js`), sonra `npm run wpkg:pack -- <srcDir> <out.wpkg>` ile `characters/` içine at. Veya uygulama içi **WPKG Editörü** kullan.

**Arkaplanlar / VMD görünmüyor?**
`VMD_Animations/` → `public/vmd` ve `GET /api/vmd` ile otomatik senkron (`vite.config.js:vmdLiveSync`). `backgrounds/` → `GET /api/backgrounds` ve `/backgrounds/<path>` altında sunulur (`backgroundsLiveSync`). Dosyaların `.vmd`/`.fbx`/resim olduğundan emin ol ve `GET http://localhost:5173/api/backgrounds` kontrol et (frontend tarafından sunulur, backend değil).

## Çalışma Zamanı

**Ses yok ama viseme oynuyor?**
Kokoro kurulu değil — `pip install kokoro-onnx` veya `TTS_PROVIDER=elevenlabs` + anahtar ayarla. Sahte mod yine de test için 60fps viseme kareleri üretir.

**Fizik patlıyor / model zeminden düşüyor?**
**Ayarlar → Physics/IK** değiştir, `gravity` (−18 varsayılan) ayarla veya **Reset Pose** yap. `waifu-viewer/src/main.js` içindeki `sanitizePhysics` bölümüne bak.

**Yakınlık / hitbox / göz takibi nasıl değiştirilir?**
Yakınlık sohbet/hitbox ( `services/tools.js` içindeki raycast bölgeleri) üzerinden `localStorage waifu:affinity` içine kaydedilir. Ayarlar içinde `hitboxing`, `eyeTracking`, `prosodyRate/Pitch` ile aç/kapat.

**Akış nasıl çalışır?**
İstemci `WS /ws/talk` üzerinden `{"type":"chat","text":"...","modelId":"ellen"}` gönderir; sunucu `llm_start` → `token` → `llm_end` (JSON `LLMStructuredOutput` → `text/emotion/gesture/intensity`) → `tts_start` → `viseme+audio` parçaları → `animation` → `done` akışı yapar. Barge-in için `{"type":"stop"}` gönder (`asyncio` görevi `ws/manager.py` ile iptal edilir).

## Masaüstü

**Electron boş / `ERR_CONNECTION_REFUSED` gösteriyor?**
Vite dev sunucusu hazır değil. `npm run desktop:dev` `wait-on http://localhost:5173` kullanır — Electron yüklenmeden önce `VITE v8.x ready` bekle.

## Hala takıldın mı?

`backend/app/main.py`, `backend/app/ws/talk.py`, `waifu-viewer/vite.config.js` yorumlarına ve tarayıcı konsolu / `uvicorn --log-level debug` çıktısına bak.

> **Dil:** [🇹🇷 Türkçe](FAQ.md) | [🇬🇧 English](FAQ.en.md)
