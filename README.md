# PuzzleCam — photobooth dengan gestur tangan

Bingkai foto dengan kedua tanganmu, susun hasilnya jadi puzzle 3×3 bergaya photobooth hitam-putih, lalu simpan ke tira foto yang bisa diunduh. Semua berjalan di browser: tanpa backend, tanpa instalasi, dan tidak ada foto yang dikirim ke server.

## Cara main

1. Tekan **Nyalakan kamera** dan izinkan akses kamera.
2. Angkat kedua tangan. Cubit jempol dan telunjuk di kedua tangan untuk membentuk bingkai.
3. Tahan cubitan selama hitung mundur 3 detik — foto diambil otomatis.
4. Foto dipecah jadi 9 keping acak. Cubit satu keping untuk memindahkannya (atau pakai mouse / sentuhan).
5. Saat puzzle lengkap, kepalkan tangan (atau klik papan) untuk menyimpannya ke tira.
6. Setelah ada foto di tira, tekan **Unduh tira** untuk menyimpan PNG.

| Gestur | Aksi |
|---|---|
| Cubit dengan dua tangan | Membuat bingkai dan memulai hitung mundur |
| Cubit satu tangan di atas keping | Menggeser keping |
| Kepalkan tangan (tahan) | Simpan puzzle yang lengkap / ulang puzzle |

## Menjalankan di komputer

Kamera hanya bisa diakses lewat `https://` atau `localhost`, jadi file `index.html` tidak bisa dibuka langsung dengan dobel-klik.

- **VS Code:** pasang ekstensi *Live Server*, klik kanan `index.html` → *Open with Live Server*.
- **Python:** `python -m http.server 5500` lalu buka `http://localhost:5500`.

## Hosting di GitHub Pages (gratis, sudah HTTPS)

1. Push isi folder ini ke repository GitHub (`index.html` harus ada di root).
2. Buka repository → **Settings** → **Pages**.
3. Di *Build and deployment*, pilih **Source: Deploy from a branch**, branch **main**, folder **/ (root)**, lalu **Save**.
4. Tunggu 1–2 menit. Situs tersedia di `https://<username>.github.io/<nama-repo>/`.

File `.nojekyll` sudah disertakan agar GitHub Pages menyajikan file apa adanya. Alternatif lain yang juga langsung jalan: Netlify (seret folder ke app.netlify.com/drop) atau Vercel.

## Struktur

```
├── index.html      # Halaman utama
├── app.js          # Pelacakan tangan, puzzle, tira foto
├── css/styles.css  # Tampilan
└── .nojekyll       # Untuk GitHub Pages
```

## Teknologi

- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) `0.10.14` — deteksi titik tangan
- Canvas 2D API — render kamera, keping puzzle, efek photobooth
- JavaScript ES Modules tanpa framework
- Font: Bricolage Grotesque & DM Sans (Google Fonts)

## Masalah umum

- **Kamera tidak menyala:** pastikan tidak dipakai aplikasi lain (Zoom, Meet, Discord) dan izin kamera diberikan lewat ikon gembok di address bar.
- **Model gagal dimuat:** butuh internet untuk mengunduh model (±10 MB) dari `storage.googleapis.com` dan runtime dari `cdn.jsdelivr.net`.
- **Cubitan tidak terdeteksi:** pastikan pencahayaan cukup dan kedua tangan terlihat jelas.

Browser yang disarankan: Chrome atau Edge di desktop.

## Lisensi

MIT
