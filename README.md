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

## Integrasi pembayaran KlikQRIS

Pembayaran QRIS menggunakan API KlikQRIS dari backend Next.js. API key dan Merchant ID tidak pernah dikirim ke browser.

### Konfigurasi

Salin nilai pada `env.example` ke environment lokal dan hosting:

```env
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
