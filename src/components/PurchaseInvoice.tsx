'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/lib/locale-context';

interface PurchaseInvoiceProps {
  order: Record<string, unknown>;
  productName: string;
  buyerName?: string;
}

const BUYER_ACKNOWLEDGEMENT = 'Dengan membeli produk ini, saya menyatakan telah membaca dan menyetujui seluruh ketentuan. Saya memahami bahwa produk premium ini diperoleh melalui jalur non-resmi dan saya menerima konsekuensi serta risiko yang mungkin terjadi pada akun yang saya gunakan.';

function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function formatPaymentMethod(value: unknown) {
  const method = String(value || 'klikqris')
    .replace(/^(pakasir|klikqris)_/i, '')
    .replace(/_/g, ' ')
    .trim();

  return method ? method.toUpperCase() : 'KLIKQRIS';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;',
  })[character] || character);
}

export default function PurchaseInvoice({ order, productName, buyerName: buyerNameProp }: PurchaseInvoiceProps) {
  const { formatPriceIDR } = useLocale();
  const [adminWhatsApp, setAdminWhatsApp] = useState('082244046330');
  const [buyerName, setBuyerName] = useState(buyerNameProp || '-');
  const [copied, setCopied] = useState(false);

  const orderNumber = String(order.order_number || '-');
  const invoiceNumber = `INV-${orderNumber}`;
  const quantity = Math.max(1, Number(order.quantity || 1));
  const total = Number(order.total_amount || 0);
  const paymentMethod = formatPaymentMethod(order.payment_method);
  const paidAtValue = String(order.paid_at || order.updated_at || order.created_at || '');
  const paidAt = paidAtValue
    ? new Date(paidAtValue).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

  useEffect(() => {
    if (buyerNameProp) return;

    const timeoutId = window.setTimeout(() => {
      try {
        const session = JSON.parse(localStorage.getItem('buyer_session') || '{}');
        setBuyerName(session?.name ? String(session.name) : '-');
      } catch {
        setBuyerName('-');
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [buyerNameProp]);

  useEffect(() => {
    fetch('/api/public/settings')
      .then((response) => response.json())
      .then((settings) => setAdminWhatsApp(settings.support_whatsapp || '082244046330'))
      .catch(() => setAdminWhatsApp('082244046330'));
  }, []);

  const invoiceText = useMemo(() => (
    `*INVOICE PEMBELIAN - PASTIPREMIUM*\n\n` +
    `No. Invoice: ${invoiceNumber}\n` +
    `No. Order: ${orderNumber}\n` +
    `Tanggal Bayar: ${paidAt}\n` +
    `Nama Buyer: ${buyerName}\n` +
    `Produk: ${productName || '-'}\n` +
    `Jumlah: ${quantity}x\n` +
    `Metode Pembayaran: ${paymentMethod}\n` +
    `Total: ${formatPriceIDR(total)}\n` +
    `Status: LUNAS\n\n` +
    `*PERNYATAAN BUYER*\n` +
    `${BUYER_ACKNOWLEDGEMENT}\n\n` +
    `Mohon verifikasi pesanan ini. Terima kasih.`
  ), [buyerName, formatPriceIDR, invoiceNumber, orderNumber, paidAt, paymentMethod, productName, quantity, total]);

  function sendToAdmin() {
    const phone = normalizeWhatsAppNumber(adminWhatsApp);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(invoiceText)}`, '_blank', 'noopener,noreferrer');
  }

  async function copyInvoice() {
    await navigator.clipboard.writeText(invoiceText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function printInvoice() {
    const printWindow = window.open('', '_blank', 'width=760,height=900');
    if (!printWindow) return;

    const rows = [
      ['No. Invoice', invoiceNumber],
      ['No. Order', orderNumber],
      ['Tanggal Bayar', paidAt],
      ['Nama Buyer', buyerName],
      ['Produk', productName || '-'],
      ['Jumlah', `${quantity}x`],
      ['Metode Pembayaran', paymentMethod],
      ['Total', formatPriceIDR(total)],
      ['Status', 'LUNAS'],
    ];
    const rowHtml = rows.map(([label, value]) => (
      `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    )).join('');

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(invoiceNumber)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 40px; color: #172033; font: 14px Arial, sans-serif; }
            .invoice { max-width: 680px; margin: auto; border: 1px solid #dce2ea; border-radius: 16px; overflow: hidden; }
            header { padding: 28px 32px; color: white; background: linear-gradient(135deg, #155eef, #0f3fae); }
            h1 { margin: 0 0 6px; font-size: 25px; }
            header p { margin: 0; opacity: .9; }
            main { padding: 28px 32px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px 0; border-bottom: 1px solid #edf0f4; text-align: left; vertical-align: top; }
            th { width: 38%; color: #637083; font-weight: 600; }
            td { font-weight: 700; }
            .paid { color: #07883f; }
            .terms { margin-top: 24px; padding: 16px; color: #7c2d12; background: #fff7ed; border: 1px solid #fdba74; border-radius: 10px; line-height: 1.6; }
            footer { padding: 18px 32px; color: #637083; background: #f7f9fc; font-size: 12px; line-height: 1.5; }
            @media print { body { padding: 0; } .invoice { border: 0; } }
          </style>
        </head>
        <body>
          <section class="invoice">
            <header><h1>Invoice Pembelian</h1><p>pastipremium.my.id</p></header>
            <main>
              <table>${rowHtml}</table>
              <div class="terms"><strong>PERNYATAAN BUYER</strong><br />${escapeHtml(BUYER_ACKNOWLEDGEMENT)}</div>
            </main>
            <footer>Invoice ini dibuat otomatis setelah pembayaran terkonfirmasi. Invoice tidak memuat data login atau password akun.</footer>
          </section>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  return (
    <section style={{
      marginTop: '20px',
      marginBottom: '24px',
      padding: '20px',
      textAlign: 'left',
      background: 'linear-gradient(145deg, var(--bg-secondary), var(--bg-card))',
      border: '1px solid var(--border-primary)',
      borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
        <div>
          <div style={{ color: 'var(--brand-primary-light)', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
            Invoice Pembelian
          </div>
          <div style={{ marginTop: '4px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800 }}>
            {invoiceNumber}
          </div>
        </div>
        <span className="badge badge-success">LUNAS</span>
      </div>

      <div style={{ display: 'grid', gap: '9px', fontSize: '0.84rem' }}>
        <InvoiceRow label="Tanggal" value={paidAt} />
        <InvoiceRow label="Buyer" value={buyerName} />
        <InvoiceRow label="Produk" value={productName || '-'} />
        <InvoiceRow label="Jumlah" value={`${quantity}x`} />
        <InvoiceRow label="Pembayaran" value={paymentMethod} />
        <InvoiceRow label="Total" value={formatPriceIDR(total)} highlight />
      </div>

      <div style={{
        marginTop: '18px',
        padding: '14px 16px',
        color: 'var(--brand-warning)',
        background: 'rgba(217, 119, 6, 0.08)',
        border: '1px solid rgba(217, 119, 6, 0.35)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.78rem',
        lineHeight: 1.6,
      }}>
        <strong style={{ display: 'block', marginBottom: '4px' }}>PERNYATAAN BUYER</strong>
        {BUYER_ACKNOWLEDGEMENT}
      </div>

      <p style={{ margin: '16px 0 12px', color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>
        Kirim invoice ini ke admin untuk verifikasi pesanan. Data login akun tidak disertakan.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <button type="button" className="btn" onClick={sendToAdmin} style={{ justifyContent: 'center', background: '#25D366', color: '#fff', border: 0 }}>
          Kirim ke Admin
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void copyInvoice()} style={{ justifyContent: 'center' }}>
          {copied ? 'Invoice Tersalin ✓' : 'Salin Invoice'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={printInvoice} style={{ gridColumn: '1 / -1', justifyContent: 'center' }}>
          Cetak / Simpan PDF
        </button>
      </div>
    </section>
  );
}

function InvoiceRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '12px' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--brand-success)' : 'var(--text-primary)', fontWeight: highlight ? 800 : 600, overflowWrap: 'anywhere' }}>
        {value}
      </span>
    </div>
  );
}
