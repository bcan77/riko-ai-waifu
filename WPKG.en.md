> **Language / Dil:** [🇹🇷 Türkçe](WPKG.md) | 🇬🇧 English (this file)

# .wpkg Guide — Character Packages

`.wpkg` is the character bundle format of Compangine (the in-app stage): a plain **ZIP with STORE compression** (renamed `.wpkg`, like Wallpaper Engine `.pkg`) containing a 3D model, voices, motions, prompts and metadata. The app reads them from `characters/*.wpkg` via `GET /api/wpkg/*`.

> Tools live in `packages/wpkg/` (pack/unpack/validate, `jszip`, 200MB limit, path-traversal guard). Backend endpoints in `backend/app/api/wpkg.py`. In-app editor add-on at `waifu-viewer/src/editor/WpkgEditor.js`.

---

## 1) Using packages

1. Drop a `.wpkg` file into `characters/` **or** import it from the app: install the **WPKG Editor** add-on first (**Settings → Extensions → Install**), then **Import .wpkg**.
2. The package appears in the editor list with its **age-rating badge** (`All Ages` / `12+` / `18+`).
3. 🔞 `18+` entries stay **blurred** until you enable **Settings → Extensions → Show mature (18+) packages**.
4. Pick a character on the stage — outfits/voices defined by the bundle apply automatically.

List/validate from a terminal:

```bash
curl http://localhost:8000/api/wpkg/list
curl "http://localhost:8000/api/wpkg/info?file=ellen.wpkg"
```

## 2) Package layout

```
my_waifu.wpkg            # zip, STORE (no compression)
├── manifest.json        # required — spec v1 metadata (see §3)
├── model/
│   └── model.pmx        # entry model (+ textures)
├── motions/
│   └── idle.vmd         # idle motion (+ gestures)
├── prompts/
│   └── system.md        # character system prompt
└── preview.png          # optional thumbnail
```

## 3) manifest.json reference

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `spec` | yes | `1` | spec version |
| `id` | yes | string `2–32 [a-z0-9_-]` | unique, also the default file name |
| `name` | yes | string `2+` | display name |
| `version` | yes | `x.y.z` | semver |
| `author` | no | string | defaults to `"you"` |
| `rating` | no | `"all"` \| `"12"` \| `"18"` | **age rating**, defaults to `"all"` |
| `tags` | no | string[] | max 24, each `2–24 [a-z0-9-]` (e.g. `["maid","shark","zzz"]`) |
| `content_flags` | no | string[] | max 12 machine flags, same charset as tags |
| `description` | no | string | max 2000 chars, shown in the editor preview |
| `model.entry` | yes | path | e.g. `"model/model.pmx"` (no `..`, no leading `/`) |
| `outfits` | no | object[] | max 16 × `{id, name 1–64, entry, preview?}` |
| `outfit_default` | no | string | must match an outfit `id` |
| `voice` | no | object | `{provider:"kokoro", en:"af_sky", ja:"jf_alpha", prosody:{pitch,rate}}` |
| `prompts.system_file` | no | path | default `"prompts/system.md"` |
| `motions.idle` | no | path | idle `.vmd`; `motions.gestures` = `{name: path}` map |
| `affinity` | no | `0–1` | starting affinity |
| `created_at` | no | `YYYY-MM-DD` | |

Minimal valid example:

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

Validate any manifest (JS or backend — same rules):

```js
import { validateManifest } from './packages/wpkg/src/index.js'
const errors = validateManifest(manifest) // [] = valid
```

```bash
curl -X POST http://localhost:8000/api/wpkg/validate \
  -H 'Content-Type: application/json' -d @manifest.json
```

## 4) Making packages — 4 ways

### A) In-app editor add-on (easiest)

1. **Settings → Extensions → WPKG Editor → Install** (loads on demand, ~48 KB).
2. Open it from the dashboard (**◨ WPKG packages**) or the stage panel (Dev mode).
3. **+ New** (or select an existing package) → fill id/name/version/author, **age rating**, tags, voices, system prompt, idle VMD, outfits JSON → **Validate** → **Save .wpkg**. The file lands in `characters/`.

### B) Backend API

```bash
# create/update (preserves model + motions of an existing bundle with the same id)
curl -X POST http://localhost:8000/api/wpkg/create \
  -H 'Content-Type: application/json' \
  -d '{"id":"my_waifu","name":"My Waifu","rating":"12","tags":["original"],"prompts":{"system":"You are My Waifu."}}'

# upload a finished .wpkg (must contain manifest.json, ≤200MB)
curl -X POST http://localhost:8000/api/wpkg/upload -F file=@my_waifu.wpkg
```

### C) CLI packers

```bash
npm run wpkg:pack -- <srcDir> <out.wpkg>   # pack any folder (must contain manifest.json)
npm run convert                            # batch: MMD_Models_MiHoyo/* → characters/*.wpkg
```

### D) By hand

Any ZIP tool with **no compression** (`zip -0 -r my_waifu.wpkg manifest.json model motions prompts`) — the loader only requires `manifest.json` at the archive root.

## 5) Age ratings

- `all` (All Ages), `12` (12+), `18` (18+). Missing `rating` = `all` (backwards compatible).
- The editor list + preview show a color-coded badge; `18+` names are blurred unless mature content is enabled.
- Uploads keep the rating inside the bundle; `POST /api/wpkg/create` merges it with the existing manifest when updating.

## 6) Troubleshooting

| Symptom | Fix |
|---------|-----|
| `manifest.json missing in wpkg` on upload | repack with `manifest.json` at archive **root**, not in a subfolder |
| `Invalid: spec must be 1` | set `"spec": 1` (number, not string) |
| `outfit_default must match an outfit id` | every `outfits[].id` unique + default points at one of them |
| `entry traversal` | paths must be relative, no `..`, no leading `/` |
| Editor button missing | install the add-on: **Settings → Extensions → WPKG Editor → Install** |
| List empty but files exist | backend reads `<repo>/characters/` — check CWD/`WPKG_DIR` and `GET /api/wpkg/list` directly |
