# HidzGenerate

Ubah link/teks, foto, video, atau file apa pun jadi kode QR. Bagian dari HidzProject.

## Cara kerja

- **Mode Link/Teks** — langsung digenerate jadi QR di browser, gak nyentuh server sama sekali.
- **Mode Upload File** — file diupload langsung dari browser ke Supabase Storage, lalu link publik hasil upload itu yang digenerate jadi QR.

Upload dilakukan langsung dari client ke Supabase Storage (bukan lewat serverless function), karena Vercel punya limit ukuran payload di function (beberapa MB) yang bakal jadi bottleneck buat file video/foto besar. Anon key di `supabase-config.js` memang aman untuk dipakai di client — pengamanannya ada di Row Level Security (RLS) policy bucket, bukan di menyembunyikan key itu.

Uploadnya pakai protokol resumable (TUS, lewat `tus-js-client`), bukan upload sekali-jalan biasa. File dikirim per potongan 6MB, otomatis dicoba ulang kalau koneksi drop (5x percobaan dengan jeda naik bertahap), dan kalau tab/koneksi mati di tengah jalan lalu file yang sama dipilih lagi, upload-nya lanjut dari titik terakhir — bukan dari nol. Ini yang bikin upload file gede (video, ratusan MB ke atas) di koneksi kurang stabil jadi jauh lebih tahan banting.

### Kustomisasi tampilan QR

Ada panel "Kustomisasi Tampilan QR" (bisa dibuka/tutup) di atas hasil, isinya:

- **Bentuk blok** — 6 pilihan gaya modul QR: Kotak, Lingkaran, Kotak Membulat, Elegan, Elegan Membulat, Sangat Membulat.
- **Warna & latar belakang** — 6 preset kombinasi warna blok + latar yang sudah dijaga kontrasnya biar tetap gampang di-scan (Cream Klasik, Putih, Gelap, Cyan Pop, Pink Pop, Transparan), plus color picker bebas kalau mau warna sendiri. Ada peringatan otomatis kalau kombinasi warna kustomnya kontrasnya terlalu rendah.
- **Logo di tengah** — upload gambar apa aja dari perangkat, langsung nempel di tengah QR (murni di browser, gak diupload ke Supabase). Gambar otomatis di-crop dari tengah jadi persegi dulu (biar ukurannya konsisten walau file aslinya landscape/portrait), lalu bisa dipilih bentuknya: Bulat, Kotak, atau Segitiga — ganti bentuk nggak perlu upload ulang. Error correction QR otomatis dinaikkan ke level tertinggi begitu ada logo, biar tetap kescan meski sebagian tertutup.

Semua pengaturan ini berlaku langsung ke QR yang lagi tampil maupun yang baru dibuat setelahnya. Riwayat di bawah tetap menyimpan gaya yang dipakai saat item itu dibuat, jadi gonta-ganti gaya belakangan gak mengubah QR yang sudah ada di riwayat.

## Setup

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) → pilih/buat project.
2. Project Settings → API → copy **Project URL** dan **anon public key**, isi ke `supabase-config.js` (ganti placeholder `ISI_..._DI_SINI`).
3. Storage → New bucket → nama `hidzgenerate` → set **Public bucket** aktif (biar link hasil upload bisa langsung diakses buat di-scan).
4. Masih di pengaturan bucket, isi **File size limit** sesuai kebutuhan (misal 2GB) — ini cara paling gampang buat jaga kuota dari abuse. Kosongkan kalau memang mau benar-benar tanpa batas.
5. Buka SQL Editor, jalankan policy berikut biar publik bisa baca & upload ke bucket ini tanpa perlu login:

```sql
create policy "hidzgenerate public read"
on storage.objects for select
using ( bucket_id = 'hidzgenerate' );

create policy "hidzgenerate public upload"
on storage.objects for insert
with check ( bucket_id = 'hidzgenerate' );
```

6. Deploy ke Vercel seperti biasa (static site, gak perlu build step).

## Struktur

```
index.html            markup halaman
style.css              styling (Neobrutalism + Y2K)
script.js               logic: tab switching, upload resumable, gaya & generate QR
supabase-config.js  init Supabase client + nama bucket + endpoint resumable
```

Dependency dimuat langsung dari CDN, gak perlu `npm install`:
- [`qr-code-styling`](https://github.com/kozakdenys/qr-code-styling) — generate QR dengan bentuk blok, warna, latar, dan logo custom.
- [`tus-js-client`](https://github.com/tus/tus-js-client) — client resumable upload (protokol TUS) ke Supabase Storage.
- [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) — buat ambil public URL file & operasi Storage lainnya.

## Catatan

File yang diupload masuk ke path `hidzgenerate/{tahun}/{bulan}/...` di bucket, biar rapi dan gampang di-audit dari Supabase Dashboard. Riwayat QR disimpan di `localStorage` browser (bukan database) — jadi tetap ada walau tab ditutup atau halamannya dibuka lagi lain waktu, dan cuma hilang kalau dihapus manual lewat tombol hapus di kartunya. Karena disimpan per-browser, riwayat gak ikut pindah kalau buka dari perangkat/browser lain.
