> **Language / Dil:** [🇹🇷 Türkçe](README.md) | 🇬🇧 English (this file)

# MMD Waifu Backend

FastAPI + WebSockets, OpenRouter (primary) + Groq (fallback), Kokoro TTS (local) + ElevenLabs/Fish optional, phoneme→viseme `a,i,u,e,o` at 60fps.

## Quick start (local)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill OPENROUTER_API_KEY and/or GROQ_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# health: http://localhost:8000/health
# ws: ws://localhost:8000/ws/talk
```

Frontend expects `Vite` proxy to `localhost:8000`. Run `npm run dev` in parallel.

## Env
`CORS_ORIGINS` comma-separated. For remote: `CORS_ORIGINS=https://your-viewer.example.com,http://localhost:5173`.

## Protocol
See `app/ws/talk.py` — `chat` → `llm_start/token/end` → `tts_start` → `viseme+audio` chunks → `done`.
Send `{"type":"stop"}` to barge-in.

## TTS voices per character
ellen → af_sky / jf_alpha, jane → af_bella / jf_gongitsune, zhu → af_nicole / jf_sakura
Override via `voice_id` in chat message.

## Remote / production
```bash
docker build -t waifu-backend .
docker run -p 8000:8000 --env-file .env waifu-backend
```
Use `wss://` on viewer if backend behind TLS.

## Notes
- Kokoro works offline (mock sine if not installed) so viseme pipeline can be tested without keys.
- Set `TTS_PROVIDER=elevenlabs` + `ELEVENLABS_API_KEY` for premium voice.
