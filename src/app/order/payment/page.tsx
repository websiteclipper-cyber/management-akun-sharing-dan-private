'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FiCheck, FiClock, FiLock } from 'react-icons/fi';
import styles from '../purchase-flow.module.css';

interface PaymentData {
  order_id: string;
  amount: number;
  total_amount: number;
  status: string;
  qris_url: string | null;
  qris_image: string | null;
  expired_at: string | null;
}

export default function KlikQrisPaymentPageWrapper() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <KlikQrisPaymentPage />
    </Suspense>
  );
}

function LoadingPage() {
  return (
    <div className="public-layout">
      <div className="loading-page"><div className="loading-spinner" /></div>
    </div>
  );
}

function KlikQrisPaymentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderNumber = searchParams.get('order') || '';
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<'pending' | 'expired' | 'error'>('pending');
  const [error, setError] = useState('');

  const checkPayment = useCallback(async () => {
    if (!orderNumber || checking || status !== 'pending') return;
    setChecking(true);
    try {
      const response = await fetch('/api/public/check-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_number: orderNumber }),
      });
      const result = await response.json();

      if (result.status === 'paid' || result.synced) {
        router.replace(`/order/success?order=${encodeURIComponent(orderNumber)}`);
      } else if (result.status === 'expired') {
        setStatus('expired');
      }
    } catch {
      // Webhook may still complete the order; the next poll will retry.
    } finally {
      setChecking(false);
    }
  }, [checking, orderNumber, router, status]);

  useEffect(() => {
    if (!orderNumber) {
      router.replace('/');
      return;
    }

    let cancelled = false;
    async function createOrLoadPayment() {
      try {
        const response = await fetch('/api/public/klikqris/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_number: orderNumber }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Gagal membuat transaksi QRIS.');

        if (result.already_paid || result.status === 'SUCCESS') {
          router.replace(`/order/success?order=${encodeURIComponent(orderNumber)}`);
          return;
        }

        if (!cancelled) setPayment(result.payment as PaymentData);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Gagal memuat pembayaran.');
          setStatus('error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    createOrLoadPayment();
    return () => { cancelled = true; };
  }, [orderNumber, router]);

  useEffect(() => {
    if (!payment || status !== 'pending') return;
    const interval = window.setInterval(checkPayment, 5000);
    return () => window.clearInterval(interval);
  }, [checkPayment, payment, status]);

  if (loading) return <LoadingPage />;

  const qrisSource = payment?.qris_url || payment?.qris_image;

  return (
    <div className={`public-layout ${styles.flowPage}`}>
      <header className={`public-header ${styles.header}`} style={{ justifyContent: 'space-between' }}>
        <Link href="/" className={`brand ${styles.brand}`}><span>PP</span> PastiPremium</Link>
      </header>

      <div className={`order-form-container ${styles.paymentContainer}`}>
        <div className={`order-form-card ${styles.flowCard} ${styles.paymentCard}`} style={{ textAlign: 'center' }}>
          <div className={styles.steps} aria-label="Tahapan pembelian">
            <span className={styles.stepDone}><i><FiCheck aria-hidden="true" /></i>Pilih paket</span>
            <b />
            <span className={styles.stepDone}><i><FiCheck aria-hidden="true" /></i>Konfirmasi</span>
            <b />
            <span className={styles.stepActive}><i>3</i>Bayar</span>
          </div>
          {status === 'pending' && payment && (
            <div className={styles.paymentState}>
              <div className={styles.statusPill}><i /> Menunggu pembayaran</div>
              <h2 style={{ marginBottom: '8px' }}>Scan QRIS untuk Membayar</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                Gunakan aplikasi bank atau e-wallet yang mendukung QRIS.
              </p>

              <div className={styles.qrFrame} style={{
                padding: '14px', background: '#fff', borderRadius: '16px',
                display: 'inline-flex', marginBottom: '18px', minWidth: '260px', minHeight: '260px',
                alignItems: 'center', justifyContent: 'center',
              }}>
                {qrisSource ? (
                  // The QR image is returned directly by KlikQRIS for this transaction.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrisSource} alt={`QRIS order ${orderNumber}`} width={260} height={260} style={{ maxWidth: '100%', height: 'auto' }} />
                ) : (
                  <span style={{ color: '#111' }}>QRIS tidak tersedia</span>
                )}
              </div>

              <div className={styles.amountCard} style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  TOTAL YANG HARUS DIBAYAR
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--brand-success)' }}>
                  {formatIdr(payment.total_amount)}
                </div>
                {payment.total_amount !== payment.amount && (
                  <p style={{ fontSize: '0.72rem', color: '#eab308', marginTop: '6px' }}>
                    Bayar tepat sesuai total termasuk kode unik.
                  </p>
                )}
              </div>

              <div className={styles.paymentMeta} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                <div>Order: <strong>{orderNumber}</strong></div>
                {payment.expired_at && <div><FiClock aria-hidden="true" /> Berlaku sampai: {payment.expired_at} WIB</div>}
              </div>

              <div className={styles.paymentInstructions}>
                <div><span>1</span><p><strong>Buka aplikasi pembayaran</strong><small>Pilih menu QRIS atau scan QR.</small></p></div>
                <div><span>2</span><p><strong>Scan dan bayar tepat</strong><small>Pastikan nominal sama dengan total.</small></p></div>
                <div><span>3</span><p><strong>Tunggu konfirmasi</strong><small>Status diperiksa secara otomatis.</small></p></div>
              </div>

              <button className={`btn btn-primary ${styles.payButton}`} onClick={checkPayment} disabled={checking} style={{ width: '100%', justifyContent: 'center' }}>
                {checking ? 'Mengecek pembayaran...' : 'Saya Sudah Bayar'}
              </button>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                Status juga diperiksa otomatis setiap 5 detik.
              </p>
              <div className={styles.securityNote}><FiLock aria-hidden="true" /> Transaksi diproses dengan aman</div>
            </div>
          )}

          {status === 'expired' && (
            <div className={styles.centerState}>
              <div className={styles.warningIcon}><FiClock aria-hidden="true" /></div>
              <h2>QRIS Kedaluwarsa</h2>
              <p style={{ color: 'var(--text-muted)', margin: '10px 0 20px' }}>
                Silakan kembali ke katalog dan buat pesanan baru.
              </p>
              <Link href="/" className="btn btn-primary">Kembali ke Katalog</Link>
            </div>
          )}

          {status === 'error' && (
            <div className={styles.centerState}>
              <div className={styles.errorIcon}>!</div>
              <h2>Pembayaran Tidak Dapat Dibuka</h2>
              <p style={{ color: 'var(--text-muted)', margin: '10px 0 20px' }}>{error}</p>
              <Link href={`/buyer/lookup?order=${encodeURIComponent(orderNumber)}`} className="btn btn-secondary">
                Lihat Pesanan
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatIdr(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

