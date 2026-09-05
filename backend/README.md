> **Dil / Language:** 🇹🇷 Türkçe (bu dosya) | [🇬🇧 English](README.en.md)

# MMD Waifu Backend

FastAPI + WebSockets, OpenRouter (birincil) + Groq (yedek), Kokoro TTS (yerel) + ElevenLabs/Fish opsiyonel, fonem→viseme `a,i,u,e,o` 60fps.

## Hızlı başlangıç (yerel)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # OPENROUTER_API_KEY ve/veya GROQ_API_KEY doldur
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# sağlık: http://localhost:8000/health
# ws: ws://localhost:8000/ws/talk
```

Frontend `Vite` proxy'sinin `localhost:8000`'a yönlendirmesini bekler. Paralelde `npm run dev` çalıştır.

## Ortam Değişkenleri
`CORS_ORIGINS` virgülle ayrılmış. Uzak için: `CORS_ORIGINS=https://your-viewer.example.com,http://localhost:5173`.

## Protokol
Bkz. `app/ws/talk.py` — `chat` → `llm_start/token/end` → `tts_start` → `viseme+audio` parçaları → `done`.
Barge-in için `{"type":"stop"}` gönder.

## Karakter başına TTS sesleri
ellen → af_sky / jf_alpha, jane → af_bella / jf_gongitsune, zhu → af_nicole / jf_sakura
Sohbet mesajındaki `voice_id` ile ezebilirsin.

## Uzak / üretim
```bash
docker build -t waifu-backend .
docker run -p 8000:8000 --env-file .env waifu-backend
```
Viewer TLS arkasındaysa `wss://` kullan.

## Notlar
- Kokoro çevrimdışı çalışır (kurulu değilse sahte sine) böylece viseme akışı anahtarsız test edilebilir.
- Premium ses için `TTS_PROVIDER=elevenlabs` + `ELEVENLABS_API_KEY` ayarla.

> **Dil:** [🇹🇷 Türkçe](README.md) | [🇬🇧 English](README.en.md)
