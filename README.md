# Notered

<div align="center">

### Tumpukan Teknologi

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![IndexedDB](https://img.shields.io/badge/IndexedDB-3185FC?style=for-the-badge&logo=indexeddb&logoColor=white)
![Canvas API](https://img.shields.io/badge/Canvas_API-FF6B6B?style=for-the-badge&logo=html5&logoColor=white)

</div>

Aplikasi penulisan dengan koreksi ejaan, referensi sketsa, dan pelacak suasana hati, dibuat dengan penuh cinta untuk Mira.

## Tentang

Notered adalah editor teks yang dirancang untuk pencinta bahasa Indonesia. Aplikasi ini memiliki kamus KBBI (Kamus Besar Bahasa Indonesia) bawaan untuk koreksi ejaan real-time, deteksi kata tidak baku, dan definisi kata. Notered juga dilengkapi dengan alat referensi sketsa untuk mencari dan mengonversi gambar menjadi referensi sketsa pensil, serta pelacak suasana hati untuk menulis jurnal dengan prompt harian dan afirmasi.

## Fitur Unggulan

- **Editor Teks** dengan dukungan contenteditable, pemeriksaan ejaan real-time terhadap KBBI, dan deteksi kata tidak baku (contoh: "nggak" -> "tidak").
- **Auto-Correct** untuk memperbaiki kesalahan ketik dan kata tidak baku secara otomatis saat mengetik.
- **Definisi KBBI** ditampilkan di bottom sheet saat mengklik kata yang ditandai, dengan validasi, pemformatan, dan resolusi referensi silang.
- **Referensi Sketsa** pencarian gambar menggunakan Unsplash API, Wikimedia Commons API, dan Openverse API, dengan konversi edge detection berbasis canvas.
- **Pelacak Suasana Hati** untuk check-in harian, pelacakan streak, prompt menulis, dan afirmasi.
- **Multi-Tema** dengan palet warna feminine yang hangat: Light, Soft Pink, Lavender, Rose Gold, dan Mint Green.
- **Ekspor** termasuk share sheet native, salin ke clipboard, download TXT, dan laporan koreksi.
- **Draft Management** untuk menyimpan, memuat, dan menghapus dokumen melalui IndexedDB dan localStorage.
- **Mascot Kucing Interaktif** dengan animasi idle (breathe, blink, tail sweep, ear twitch, paw shuffle) dan perubahan ekspresi mood (senang, khawatir, netral).

## Data KBBI

- **85.039 entri kata** dengan tag part-of-speech dan definisi terformat dari Kamus Besar Bahasa Indonesia resmi.
- **876 mapping typo/kata tidak baku** (contoh: "mnulis" -> "menulis", "nggak" -> "tidak") untuk koreksi otomatis.
- Definisi divalidasi, diformat, dan direferensikan silang (contoh: "Lihat enyah" mengarah ke definisi asli kata "enyah") melalui modul kbbi-validator dan kbbi-parser.
- Fallback pencarian KBBI API jika kata tidak ditemukan di dataset lokal.

## Tumpukan Teknologi

- **Bahasa:** Vanilla JavaScript (ES Modules)
- **Markup:** HTML5 dengan editor contenteditable
- **Styling:** CSS3 dengan custom properties (CSS variables), glassmorphism backdrop-filter, grid layout
- **Penyimpanan Data:** IndexedDB untuk draft, localStorage untuk setelan dan log mood
- **Kamus:** Dataset JSON lokal (85k+ entri) dengan lazy loading dan pencarian in-memory
- **Pencarian Gambar:** Unsplash API, Wikimedia Commons API, Openverse API (dapat diubah di Pengaturan)
- **Pemrosesan Gambar:** HTML5 Canvas API untuk konversi grayscale, Gaussian blur, dan efek sketsa edge detection
- **Animasi:** CSS @keyframes murni dengan will-change untuk akselerasi GPU
- **PWA:** Meta tag mobile-web-app-capable, dukungan safe-area-inset, kontrol overscroll-behavior
- **Aksesibilitas:** Label ARIA, outline focus-visible, touch-action manipulation, media query reduced-motion

## Penggunaan

Buka `index.html` di browser untuk mulai menulis. Editor memuat teks contoh yang mendemonstrasikan fitur pemeriksaan ejaan. Klik kata yang digaris bawahi untuk melihat saran dan definisi KBBI.

Ketuk tab di bagian bawah untuk berpindah antar Editor, Referensi Sketsa, Draft, dan Pelacak Suasana Hati.

## Detail Teknis

Dibangun sebagai single-page application menggunakan vanilla JavaScript (ES modules) tanpa framework dependencies. Semua data kamus dimuat client-side dari JSON dengan lazy parsing untuk performa. Konversi sketsa menggunakan edge detection berbasis canvas dengan parameter blur (2-30) dan kontras (0-50) yang dapat dikonfigurasi. Draft disimpan otomatis saat idle dan bertahan antar sesi.

## Dibuat untuk Mira

Aplikasi ini diciptakan sebagai hadiah personal, menggabungkan alat menulis dengan interaksi bertema kucing yang menggemaskan dan desain feminine yang penuh perhatian.