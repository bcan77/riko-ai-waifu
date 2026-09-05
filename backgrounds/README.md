> **Dil / Language:** 🇹🇷 Türkçe (bu dosya) | [🇬🇧 English](README.en.md)

# Arkaplanlar

Görüntüleyicide sahne arkaplanını değiştirmek için buraya resimler bırak.

- `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.gif` desteklenir
- İç içe klasörler desteklenir — seçici `klasör/isim` olarak gösterir
- İki yerleşik her zaman mevcut: **Gradient** (mavi/siyah) ve **Solid**
- Değişiklikler canlı — yeniden yükleme gerekmez (dev) ve Ayarlar → `backgroundId` ile kalıcı
- Dosyalar `/backgrounds/<path>` altında sunulur ve `GET /api/backgrounds` ile listelenir

Örnek:
```
backgrounds/
  beach.png
  night-city.jpg
  Cozy-Living-Room/  # mevcut örnek dokular (ayrıca gösterilir)
```

Uygulamada seç: **Panel → Scene → Background** veya ana menüden.

> **Dil:** [🇹🇷 Türkçe](README.md) | [🇬🇧 English](README.en.md)
