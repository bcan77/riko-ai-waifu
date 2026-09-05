> **Language / Dil:** [🇹🇷 Türkçe](README.md) | 🇬🇧 English (this file)

# Backgrounds

Drop images here to change the stage backdrop in the viewer.

- Supports `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.gif`
- Nested folders are supported — the picker shows `folder/name`
- Two built-ins are always available: **Gradient** (blue/black) and **Solid**
- Changes are live — no reload needed (dev) and persisted via Settings → `backgroundId`
- Files are served at `/backgrounds/<path>` and listed at `GET /api/backgrounds`

Example:
```
backgrounds/
  beach.png
  night-city.jpg
  Cozy-Living-Room/  # existing sample textures (also shown)
```

Pick them in the app: **Panel → Scene → Background** or from the main menu.
