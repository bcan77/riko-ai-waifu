> **Dil / Language:** 🇹🇷 Türkçe (bu dosya) | [🇬🇧 English](WPKG.en.md)

# .wpkg Kılavuzu — Karakter Paketleri

`.wpkg`, Compangine’in (uygulama içi sahne) karakter paket formatıdır: **STORE sıkıştırmalı düz bir ZIP** (`.wpkg` diye yeniden adlandırılmış, Wallpaper Engine `.pkg` gibi). İçinde 3D model, sesler, hareketler, istemler ve üstveri bulunur. Uygulama bunları `characters/*.wpkg` altından `GET /api/wpkg/*` ile okur.

> Araçlar `packages/wpkg/` altında (paketle/aç/doğrula, `jszip`, 200MB limit, yol-atlama koruması). Backend uçları `backend/app/api/wpkg.py` içinde. Uygulama içi editör eklentisi `waifu-viewer/src/editor/WpkgEditor.js` konumunda.

---

## 1) Paketleri kullanma

1. Bir `.wpkg` dosyasını `characters/` klasörüne at **veya** uygulamadan içe aktar: önce **WPKG Editor** eklentisini kur (**Ayarlar → Eklentiler → Kur**), sonra **.wpkg İçe Aktar**.
2. Paket, editör listesinde **yaş derecesi rozetiyle** görünür (`Her Yaş` / `12+` / `18+`).
3. 🔞 `18+` girdiler, **Ayarlar → Eklentiler → Yetişkin (18+) paketleri göster** açılana kadar **bulanık** kalır.
4. Sahneden karakteri seç — paketin tanımladığı kostüm/sesler otomatik uygulanır.

Terminalden listele/doğrula:

```bash
curl http://localhost:8000/api/wpkg/list
curl "http://localhost:8000/api/wpkg/info?file=ellen.wpkg"
```

## 2) Paket yapısı

```
my_waifu.wpkg            # zip, STORE (sıkıştırmasız)
├── manifest.json        # zorunlu — spec v1 üstverisi (bkz. §3)
├── model/
│   └── model.pmx        # giriş modeli (+ dokular)
├── motions/
│   └── idle.vmd         # idle hareketi (+ jestler)
├── prompts/
│   └── system.md        # karakter sistem istemi
└── preview.png          # opsiyonel küçük resim
```

## 3) manifest.json başvurusu

| Alan | Zorunlu | Tür | Not |
|------|---------|-----|-----|
| `spec` | evet | `1` | spec sürümü |
| `id` | evet | string `2–32 [a-z0-9_-]` | benzersiz, aynı zamanda varsayılan dosya adı |
| `name` | evet | string `2+` | görünen ad |
| `version` | evet | `x.y.z` | semver |
| `author` | hayır | string | varsayılan `"you"` |
| `rating` | hayır | `"all"` \| `"12"` \| `"18"` | **yaş derecesi**, varsayılan `"all"` |
| `tags` | hayır | string[] | en fazla 24, her biri `2–24 [a-z0-9-]` (örn. `["maid","shark","zzz"]`) |
| `content_flags` | hayır | string[] | en fazla 12 makine bayrağı, etiketlerle aynı karakter seti |
| `description` | hayır | string | en fazla 2000 karakter, editör önizlemede görünür |
| `model.entry` | evet | yol | örn. `"model/model.pmx"` (`..` yok, başında `/` yok) |
| `outfits` | hayır | object[] | en fazla 16 × `{id, name 1–64, entry, preview?}` |
| `outfit_default` | hayır | string | bir kostüm `id`’siyle eşleşmeli |
| `voice` | hayır | object | `{provider:"kokoro", en:"af_sky", ja:"jf_alpha", prosody:{pitch,rate}}` |
| `prompts.system_file` | hayır | yol | varsayılan `"prompts/system.md"` |
| `motions.idle` | hayır | yol | idle `.vmd`; `motions.gestures` = `{ad: yol}` eşlemesi |
| `affinity` | hayır | `0–1` | başlangıç yakınlığı |
| `created_at` | hayır | `YYYY-MM-DD` | |

En küçük geçerli örnek:

```json
{
  "spec": 1,
  "id": "my_waifu",
  "name": "My Waifu",
  "version": "1.0.0",
  "rating": "all",
  "tags": ["original"],
  "model": { "entry": "model/model.pmx" },
  "voice": { "provider": "kokoro", "en": "af_sky", "ja": "jf_alpha" },
  "prompts": { "system_file": "prompts/system.md" },
  "motions": { "idle": "motions/idle.vmd", "gestures": {} }
}
```

Herhangi bir manifesti doğrula (JS veya backend — kurallar aynı):

```js
import { validateManifest } from './packages/wpkg/src/index.js'
const errors = validateManifest(manifest) // [] = geçerli
```

```bash
curl -X POST http://localhost:8000/api/wpkg/validate \
  -H 'Content-Type: application/json' -d @manifest.json
```

## 4) Paket yapma — 4 yol

### A) Uygulama içi editör eklentisi (en kolayı)

1. **Ayarlar → Eklentiler → WPKG Editor → Kur** (ihtiyaç anında yüklenir, ~48 KB).
2. Panelden (**◨ WPKG paketleri**) veya sahne panelinden (Geliştirici modu) aç.
3. **+ Yeni** (veya mevcut bir paket seç) → id/ad/sürüm/yazar, **yaş derecesi**, etiketler, sesler, sistem istemi, idle VMD, kostüm JSON’unu doldur → **Doğrula** → **.wpkg Kaydet**. Dosya `characters/` altına iner.

### B) Backend API

```bash
# oluştur/güncelle (aynı id’li mevcut paketin model + hareketlerini korur)
curl -X POST http://localhost:8000/api/wpkg/create \
  -H 'Content-Type: application/json' \
  -d '{"id":"my_waifu","name":"My Waifu","rating":"12","tags":["original"],"prompts":{"system":"Sen My Waifu’sun."}}'

# bitmiş .wpkg yükle (içinde manifest.json olmalı, ≤200MB)
curl -X POST http://localhost:8000/api/wpkg/upload -F file=@my_waifu.wpkg
```

### C) CLI paketleyiciler

```bash
npm run wpkg:pack -- <kaynakKlasör> <çıktı.wpkg>   # manifest.json içeren her klasörü paketler
npm run convert                                    # toplu: MMD_Models_MiHoyo/* → characters/*.wpkg
```

### D) Elden

**Sıkıştırmasız** herhangi bir ZIP aracı (`zip -0 -r my_waifu.wpkg manifest.json model motions prompts`) — yükleyici yalnızca arşiv kökünde `manifest.json` ister.

## 5) Yaş dereceleri

- `all` (Her Yaş), `12` (12+), `18` (18+). `rating` yoksa = `all` (geriye uyumlu).
- Editör liste + önizlemede renkli rozet gösterir; `18+` adları yetişkin içeriği açılmadan bulanıktır.
- Yüklemeler dereceyi paketin içinde saklar; `POST /api/wpkg/create` güncellerken mevcut manifestle birleştirir.

## 6) Sorun giderme

| Belirti | Çözüm |
|---------|-------|
| Yüklemede `manifest.json missing in wpkg` | `manifest.json` arşiv **kökünde** olacak şekilde yeniden paketle, alt klasörde değil |
| `Invalid: spec must be 1` | `"spec": 1` yaz (string değil sayı) |
| `outfit_default must match an outfit id` | her `outfits[].id` benzersiz olmalı + varsayılan bunlardan birini göstermeli |
| `entry traversal` | yollar göreli olmalı, `..` yok, başında `/` yok |
| Editör düğmesi yok | eklentiyi kur: **Ayarlar → Eklentiler → WPKG Editor → Kur** |
| Dosya var ama liste boş | backend `<repo>/characters/` klasörünü okur — CWD/`WPKG_DIR`’i ve doğrudan `GET /api/wpkg/list` çıktısını kontrol et |
