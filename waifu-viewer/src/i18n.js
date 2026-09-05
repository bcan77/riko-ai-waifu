/**
 * i18n — minimal EN/TR dictionary for SetupWizard + Settings.
 * Add keys here as needed; fallback is English.
 */
export const LOCALES = ['en','tr']
export const LOCALE_LABELS = { en: 'English', tr: 'Türkçe' }
export const LOCALE_FLAGS = { en: '🇬🇧', tr: '🇹🇷' }

export const dict = {
  en: {
    // SetupWizard
    wiz_step: 'Step',
    wiz_steps: ['Welcome','API Keys','Character','Ready'],
    wiz_welcome_title: 'Welcome to Waifu MMD',
    wiz_welcome_body: 'This wizard saves everything <b>locally</b> — no cloud. Set up API keys to enable real chat & voice, or skip and use offline mock. You can change everything later in <b>⚙ Settings</b> (Ctrl+,).',
    wiz_welcome_hint: 'Tip: press <b>,</b> anytime to open Settings. Keys are local-only (backend/user_keys.json).',
    wiz_language: 'Language / Dil',
    wiz_language_hint: 'Choose your language. You can change it anytime in Settings → App.',
    wiz_first_setup: 'First setup',
    wiz_skip: 'Skip',
    wiz_back: '‹ Back',
    wiz_next: 'Next ›',
    wiz_finish: 'Finish ♡',
    wiz_api_title: 'API Keys — local only',
    wiz_api_hint: 'Paste keys from openrouter.ai / console.groq.com / elevenlabs.io. Leave blank to use offline mock. All local.',
    wiz_api_openrouter: 'OpenRouter (primary LLM)',
    wiz_api_model: 'OpenRouter model',
    wiz_api_model_hint: 'Free suffix = no charge. Full list at',
    wiz_api_groq: 'Groq (fallback)',
    wiz_api_eleven: 'ElevenLabs (premium TTS)',
    wiz_api_fish: 'Fish Audio (alt TTS)',
    wiz_api_saved_hint: 'Keys are saved to <code>localStorage</code> + <code>POST /api/keys</code> → <code>backend/user_keys.json</code>. No restart needed.',
    wiz_char_title: 'Character & Voice',
    wiz_char_voice: 'Voice',
    wiz_char_en_voice: 'EN voice',
    wiz_char_ja_voice: 'JA voice',
    wiz_char_premium: 'Premium TTS',
    wiz_char_prefs: 'Quick prefs',
    wiz_char_shadows: 'Shadows',
    wiz_char_eye: 'Eye tracking',
    wiz_char_dpr: 'DPR cap',
    wiz_ready_title: "You're all set",
    wiz_ready_body: 'Keys (if any) are saved locally. Hit <b>Finish</b> to start — you can reopen setup via <b>⚙ Settings → App → Re-run setup</b> or press <b>,</b>.',
    wiz_ready_health: 'Backend health:',
    wiz_health_checking: 'checking…',
    wiz_health_unreachable: 'unreachable — check backend :8000',
  },
  tr: {
    wiz_step: 'Adım',
    wiz_steps: ['Hoş Geldin','API Anahtarları','Karakter','Hazır'],
    wiz_welcome_title: 'Waifu MMD — Hoş Geldin',
    wiz_welcome_body: 'Bu sihirbaz her şeyi <b>yerel</b> kaydeder — bulut yok. Gerçek sohbet ve ses için API anahtarlarını gir veya atlayıp çevrimdışı sahte modla devam et. Her şeyi sonra <b>⚙ Ayarlar</b> (Ctrl+,) üzerinden değiştirebilirsin.',
    wiz_welcome_hint: 'İpucu: <b>,</b> tuşu ile istediğin zaman Ayarları açabilirsin. Anahtarlar sadece yerel (backend/user_keys.json).',
    wiz_language: 'Dil / Language',
    wiz_language_hint: 'Dilini seç. İstediğin zaman Ayarlar → Uygulama üzerinden değiştirebilirsin.',
    wiz_first_setup: 'İlk kurulum',
    wiz_skip: 'Atla',
    wiz_back: '‹ Geri',
    wiz_next: 'İleri ›',
    wiz_finish: 'Bitir ♡',
    wiz_api_title: 'API Anahtarları — sadece yerel',
    wiz_api_hint: 'Anahtarları openrouter.ai / console.groq.com / elevenlabs.io adreslerinden yapıştır. Çevrimdışı sahte mod için boş bırak. Hepsi yerel.',
    wiz_api_openrouter: 'OpenRouter (birincil LLM)',
    wiz_api_model: 'OpenRouter modeli',
    wiz_api_model_hint: 'Free eki = ücretsiz. Tam liste:',
    wiz_api_groq: 'Groq (yedek)',
    wiz_api_eleven: 'ElevenLabs (premium TTS)',
    wiz_api_fish: 'Fish Audio (alternatif TTS)',
    wiz_api_saved_hint: 'Anahtarlar <code>localStorage</code> + <code>POST /api/keys</code> → <code>backend/user_keys.json</code> içine kaydedilir. Yeniden başlatma gerekmez.',
    wiz_char_title: 'Karakter & Ses',
    wiz_char_voice: 'Ses',
    wiz_char_en_voice: 'EN ses',
    wiz_char_ja_voice: 'JA ses',
    wiz_char_premium: 'Premium TTS',
    wiz_char_prefs: 'Hızlı tercihler',
    wiz_char_shadows: 'Gölgeler',
    wiz_char_eye: 'Göz takibi',
    wiz_char_dpr: 'DPR sınırı',
    wiz_ready_title: 'Her şey hazır',
    wiz_ready_body: 'Anahtarlar (varsa) yerel olarak kaydedildi. Başlamak için <b>Bitir</b> de — kurulumu tekrar <b>⚙ Ayarlar → Uygulama → Kurulumu yeniden başlat</b> veya <b>,</b> ile açabilirsin.',
    wiz_ready_health: 'Backend durumu:',
    wiz_health_checking: 'kontrol ediliyor…',
    wiz_health_unreachable: 'erişilemiyor — backend :8000 kontrol et',
  },
}

export function t(locale, key){
  const l = LOCALES.includes(locale) ? locale : 'en'
  return (dict[l] && dict[l][key]) ?? dict.en[key] ?? key
}
export function getLocale(){
  try{
    const raw = JSON.parse(localStorage.getItem('waifu:settings')||'null')
    if(raw && ['en','tr'].includes(raw.locale)) return raw.locale
  }catch{}
  // browser language fallback
  try{
    const nav = (navigator.language||'en').toLowerCase()
    if(nav.startsWith('tr')) return 'tr'
  }catch{}
  return 'tr'
}
