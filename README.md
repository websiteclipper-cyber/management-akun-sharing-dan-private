This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Integrasi pembayaran KiPay

Checkout baru memakai KiPay secara default. Transaksi KlikQRIS yang sudah tersimpan
tetap ditangani oleh gateway asalnya. Implementasi mengikuti
[dokumentasi resmi KiPay](https://kipay.id/docs).

### Konfigurasi KiPay

Tambahkan ke `.env.local` untuk pengembangan dan environment hosting untuk deployment:

```env
PAYMENT_GATEWAY=kipay
KIPAY_API_KEY=isi_dari_project_sandbox_kipay
KIPAY_WEBHOOK_SECRET=isi_dari_project_yang_sama
KIPAY_ENV=sandbox
```

Environment Supabase dan autentikasi yang tercantum di `env.example` tetap diperlukan.
Jangan gunakan prefix `NEXT_PUBLIC_` untuk kredensial pembayaran.

Di dashboard KiPay > **Project & Webhook**, pilih project sandbox dan daftarkan:

```text
https://DOMAIN_WEBSITE_ANDA/api/webhooks/kipay
```

Gunakan domain publik deployment yang benar. Saat URL webhook disimpan, KiPay
menampilkan webhook secret satu kali; simpan sebagai `KIPAY_WEBHOOK_SECRET`.
API key dan secret harus berasal dari project yang sama. Untuk pengembangan lokal,
webhook memerlukan URL HTTPS publik; polling status tetap tersedia untuk buyer.

### Uji sandbox sebelum production

1. Jalankan aplikasi dengan environment sandbox. Login sebagai buyer dan buat pesanan.
2. Pastikan QRIS tampil dan total mencakup kode unik dari KiPay. Muat ulang halaman;
   transaksi yang sama harus digunakan kembali.
3. Jalankan **tes webhook** dari dashboard KiPay; endpoint harus merespons HTTP 200.
4. Simulasikan pembayaran dari dashboard/API console KiPay untuk transaksi sandbox
   tersebut. Pastikan order menjadi paid dan akun terkirim sesuai jumlah pembelian.
5. Kirim ulang event yang sama; akun dan komisi tidak boleh bertambah lagi.
6. Uji transaksi expired, serta **Saya Sudah Bayar** dan **Sync Pembayaran** di admin
   saat webhook terlambat. Status diverifikasi ulang lewat API KiPay.
7. Setelah berhasil, ganti API key dan webhook secret ke project production,
   ubah `KIPAY_ENV=production`, pasang URL webhook pada project production, lalu deploy.
   Selesaikan atau rekonsiliasi transaksi sandbox sebelum mengganti environment.

API sandbox dan production menggunakan host yang sama; project API key menentukan
mode. Backend menolak respons dengan mode yang berbeda dari `KIPAY_ENV`.
Simulasi pembayaran tidak diekspos sebagai endpoint aplikasi.

### Perilaku dan pemulihan

- `/api/public/payments/create` membutuhkan sesi buyer aktif dan memeriksa kepemilikan
  order. Endpoint lama `/api/public/klikqris/create` meneruskan ke handler yang sama.
- Gambar QR diambil server-to-server dan dikirim sebagai data PNG. URL QR upstream
  mengandung API key sehingga tidak disimpan atau dikirim ke browser.
- Webhook memverifikasi HMAC-SHA256 atas raw body, timestamp dan delivery ID, dengan
  batas replay lima menit. Setelah itu backend membaca ulang transaksi dari API dan
  mencocokkan ID, order, mode, nominal dasar dan total pembayaran sebelum mengirim akun.
- Tombol **Sync Pembayaran** memeriksa transaksi pending di kedua gateway. URL admin
  `/api/admin/sync-payments` dan alias lama `/api/admin/sync-klikqris` membutuhkan superadmin.
- Permintaan create bersamaan dikunci melalui `orders.payment_reference`. Jika POST
  ke KiPay timeout atau transaksi gagal disimpan, marker `kipay-creating` sengaja
  dipertahankan: API KiPay belum mendokumentasikan idempotency key untuk create.
  Admin harus memeriksa transaksi berdasarkan nomor order di dashboard KiPay.
  Jika ada transaksi, rekonsiliasi dan simpan ID serta data transaksi yang benar;
  jika sudah dipastikan tidak ada transaksi yang dapat dibayar, reset marker menjadi
  NULL sebelum mencoba lagi. Jangan mereset marker saat hasil request belum diketahui.
  Penolakan create yang pasti (HTTP 400, 404, atau 409 sesuai kontrak KiPay)
  melepaskan marker otomatis agar konfigurasi yang sudah dikoreksi bisa dicoba lagi.
  Respons jaringan/5xx dan kegagalan setelah transaksi dibuat tetap mempertahankan marker.
- Error pencatatan komisi dicatat server untuk rekonsiliasi admin; hanya proses
  pertama yang mengubah pending menjadi paid yang membukukan komisi.
- Integrasi ini menggunakan tabel serta RPC pengiriman yang sudah ada tanpa migrasi
  database baru. RPC `assign_account_for_order` harus mengunci order dan membatasi
  assignment sesuai quantity; skema terhubung telah diperiksa secara read-only.

Pengujian lokal (mock API/DB, tanpa memindahkan dana):

```bash
node --test src/lib/kipay.test.mjs
npx tsc --noEmit --incremental false
npm run build
```

Untuk uji API sandbox sungguhan (membuat satu transaksi uji, mengambil PNG, lalu
menyimulasikan status paid tanpa mengubah order aplikasi):

```bash
node scripts/verify-kipay-sandbox.mjs --create-and-simulate
```

Script ini membutuhkan `KIPAY_ENV=sandbox`, membaca `.env.local`, dan menolak
environment production. Transaksi uji terlihat di dashboard KiPay dengan note
`KIPAY-INTEGRATION-TEST-...`.

### KlikQRIS (kompatibilitas)

Pembayaran QRIS menggunakan API KlikQRIS dari backend Next.js. API key dan Merchant ID tidak pernah dikirim ke browser.

### Konfigurasi

Salin nilai pada `env.example` ke environment lokal dan hosting:

```env
PAYMENT_GATEWAY=klikqris
KLIKQRIS_API_KEY=isi_dari_dashboard_klikqris
KLIKQRIS_MERCHANT_ID=isi_dari_dashboard_klikqris
KLIKQRIS_ENV=sandbox
KLIKQRIS_CALLBACK_URL=https://pastipremium.my.id/api/webhooks/klikqris
```

Gunakan `sandbox` sampai alur create QRIS, simulasi pembayaran, webhook, dan pengiriman akun berhasil. Setelah itu ubah `KLIKQRIS_ENV` menjadi `production` dan deploy ulang.

Endpoint callback yang perlu didaftarkan pada dashboard KlikQRIS:

```text
https://pastipremium.my.id/api/webhooks/klikqris
```

Dokumentasi resmi: https://klikqris.com/dokumentasi-api
