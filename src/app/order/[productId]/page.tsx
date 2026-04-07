'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';
import Link from 'next/link';

interface BuyerSession {
  id: number;
  name: string;
  email: string;
  phone: string;
}

interface DiscountInfo {
  campaign_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  base_price: number;
  final_price: number;
}

export default function OrderPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [buyer, setBuyer] = useState<BuyerSession | null>(null);
  const [promo, setPromo] = useState<any>(null);
  const [result, setResult] = useState<{ order_number: string; amount: number; discount_amount?: number } | null>(null);
  const [error, setError] = useState('');

  // Discount code states
  const [discountCode, setDiscountCode] = useState('');
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [discountLoading, setDiscountLoading] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem('buyer_session');
    if (!session) {
      router.push(`/buyer/login?redirect=/order/${params.productId}`);
      return;
    }
    setBuyer(JSON.parse(session));

    async function load() {
      const { data } = await supabase.from('products').select('*').eq('id', params.productId).eq('status', 'active').single();
      setProduct(data);
      if (data) {
        const now = new Date().toISOString();
        const { data: promoData } = await supabase
          .from('promos')
          .select('*')
          .eq('product_id', data.id)
          .eq('is_active', true)
          .lte('start_date', now)
          .gte('end_date', now)
          .maybeSingle();
        setPromo(promoData || null);
      }
      setLoading(false);
    }
    load();
  }, [params.productId, router]);

  async function handleApplyDiscount() {
    if (!discountCode.trim() || !product || !buyer) return;
    setDiscountLoading(true);
    setDiscountError('');
    setDiscountInfo(null);

    try {
      const res = await fetch('/api/public/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: discountCode.trim(),
          product_id: product.id,
          buyer_id: buyer.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDiscountError(data.error || 'Kode diskon tidak valid');
      } else {
        setDiscountInfo(data);
      }
    } catch {
      setDiscountError('Gagal memvalidasi kode diskon');
    } finally {
      setDiscountLoading(false);
    }
  }

  function handleRemoveDiscount() {
    setDiscountInfo(null);
    setDiscountCode('');
    setDiscountError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buyer) return;
    setSubmitting(true);
    setError('');

    try {
      // Check if ref_code has expired (30-day TTL)
      let refCode = localStorage.getItem('ref_code') || '';
      const refTs = localStorage.getItem('ref_code_ts');
      if (refCode && refTs && Date.now() - Number(refTs) > 30 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('ref_code');
        localStorage.removeItem('ref_code_ts');
        refCode = '';
      }
      const res = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_name: buyer.name,
          buyer_email: buyer.email,
          buyer_phone: buyer.phone,
          product_id: product!.id,
          ref_code: refCode,
          discount_code: discountInfo ? discountInfo.code : '',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Gagal membuat pesanan'); setSubmitting(false); return; }
      setResult({ order_number: data.order_number, amount: data.amount, discount_amount: data.discount_amount });
    } catch {
      setError('Terjadi kesalahan koneksi');
      setSubmitting(false);
    }
  }

  function handlePayWithPakasir() {
    if (!result) return;
    // Redirect to Pakasir payment page
    const redirectUrl = `${window.location.origin}/order/success?order=${result.order_number}`;
    const pakasirUrl = `https://app.pakasir.com/pay/pastipremiumid1/${result.amount}?order_id=${result.order_number}&redirect=${encodeURIComponent(redirectUrl)}`;
    window.location.href = pakasirUrl;
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  if (loading) return <div className="public-layout"><div className="loading-page"><div className="loading-spinner" /></div></div>;
  if (!product) return <div className="public-layout"><div className="empty-state"><h3>Produk tidak ditemukan</h3><Link href="/" className="btn btn-primary">Kembali</Link></div></div>;

  const displayPrice = promo ? promo.promo_price : product.price;
  const finalDisplayPrice = discountInfo ? discountInfo.final_price : displayPrice;

  return (
    <div className="public-layout">
      <header className="public-header" style={{ justifyContent: 'space-between' }}>
        <Link href="/" className="brand">✦ pastipremium.store</Link>
        {buyer && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>👤 {buyer.name}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => { localStorage.removeItem('buyer_session'); router.push('/buyer/login'); }}>Logout</button>
          </div>
        )}
      </header>

      <div className="order-form-container">
        {result ? (
          /* ===== PAYMENT VIA PAKASIR ===== */
          <div className="order-form-card">
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>💳</div>
              <h2 style={{ marginBottom: '8px' }}>Lanjutkan Pembayaran</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Pesanan berhasil dibuat! Silakan lanjutkan pembayaran
              </p>
            </div>

            {/* Order Summary */}
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)', padding: '16px', marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: result.discount_amount ? '12px' : '0' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Order #{result.order_number}
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{product.name}</div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-success)' }}>
                  {formatPrice(result.amount)}
                </div>
              </div>
              {result.discount_amount !== undefined && result.discount_amount > 0 && (
                <div style={{
                  borderTop: '1px solid var(--border-primary)', paddingTop: '10px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span style={{
                    background: 'rgba(74,222,128,0.12)', color: '#4ade80', fontSize: '0.7rem',
                    fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                  }}>DISKON</span>
                  <span style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 600 }}>
                    Hemat {formatPrice(result.discount_amount)}
                  </span>
                </div>
              )}
            </div>

            {/* PAKASIR Payment Button */}
            <div style={{ marginBottom: '16px' }}>
              <button
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '18px 24px',
                  fontSize: '1rem',
                  background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
                  border: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onClick={handlePayWithPakasir}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                  <span style={{ fontSize: '1.3rem' }}>⚡</span>
                  <span>Bayar via QRIS / Virtual Account</span>
                </span>
              </button>
              <div style={{ textAlign: 'center', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--brand-success)', fontWeight: 600 }}>✓ Otomatis</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>— Akun langsung dikirim setelah bayar</span>
              </div>
            </div>

            {/* Supported Methods Icons */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
              padding: '12px', marginBottom: '20px', flexWrap: 'wrap',
            }}>
              {['QRIS', 'BRI', 'BNI', 'CIMB', 'Permata', 'Maybank'].map(m => (
                <span key={m} style={{
                  fontSize: '0.65rem', fontWeight: 700, background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)', borderRadius: '6px',
                  padding: '4px 8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>{m}</span>
              ))}
            </div>

            {/* Link to check status */}
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <Link
                href={`/buyer/lookup?order=${result.order_number}`}
                style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textDecoration: 'underline' }}
              >
                Bayar nanti? Cek status pesanan →
              </Link>
            </div>
          </div>
        ) : (
          <div className="order-form-card">
            <h2>Konfirmasi Pesanan</h2>
            <div className="order-product-summary">
              <div className="platform" style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--brand-accent)' }}>
                {product.platform_name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{product.name}</h4>
                {promo && (
                  <span className="badge badge-danger" style={{ animation: 'pulse 2s infinite' }}>
                    {promo.promo_label.toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                {promo ? (
                  <>
                    <span className="price" style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                      {formatPrice(promo.original_price)}
                    </span>
                    <span className="price" style={{ color: 'var(--brand-danger)' }}>{formatPrice(displayPrice)}</span>
                  </>
                ) : (
                  <span className="price">{formatPrice(product.price)}</span>
                )}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {product.duration_days} hari</span>
                <span className={`badge ${product.account_type === 'sharing' ? 'badge-info' : 'badge-primary'}`}>{product.account_type}</span>
              </div>
            </div>

            {/* Buyer Info */}
            <div style={{ background: 'rgba(108,92,231,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Data Pembeli
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Nama</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{buyer?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Email</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{buyer?.email}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>WhatsApp</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{buyer?.phone}</span>
                </div>
              </div>
            </div>

            {/* ===== DISCOUNT CODE SECTION ===== */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${discountInfo ? 'rgba(74,222,128,0.4)' : 'var(--border-primary)'}`,
              padding: '16px',
              marginBottom: '20px',
              transition: 'all 0.3s ease',
            }}>
              <div style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '10px',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span>🎟️</span> Kode Promo / Voucher
              </div>

              {discountInfo ? (
                /* === Successfully applied discount === */
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(74,222,128,0.08)',
                  borderRadius: '8px', padding: '10px 14px',
                  border: '1px solid rgba(74,222,128,0.2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '1.4rem', lineHeight: 1,
                      filter: 'drop-shadow(0 0 4px rgba(74,222,128,0.4))',
                    }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4ade80', letterSpacing: '0.5px' }}>
                        {discountInfo.code}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {discountInfo.discount_type === 'percentage'
                          ? `Diskon ${discountInfo.discount_value}%`
                          : `Potongan ${formatPrice(discountInfo.discount_value)}`}
                        {' '}&mdash; Hemat <strong style={{ color: '#4ade80' }}>{formatPrice(discountInfo.discount_amount)}</strong>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    style={{
                      background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                      color: '#f87171', borderRadius: '8px', padding: '4px 12px',
                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(248,113,113,0.2)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
                  >
                    Hapus
                  </button>
                </div>
              ) : (
                /* === Input field for code === */
                <div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={discountCode}
                      onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setDiscountError(''); }}
                      placeholder="Masukkan kode promo..."
                      style={{
                        flex: 1, fontWeight: 600, letterSpacing: '1px',
                        textTransform: 'uppercase', fontSize: '0.9rem',
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyDiscount(); } }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleApplyDiscount}
                      disabled={discountLoading || !discountCode.trim()}
                      style={{
                        minWidth: '90px', justifyContent: 'center',
                        opacity: discountLoading || !discountCode.trim() ? 0.5 : 1,
                      }}
                    >
                      {discountLoading ? <span className="loading-spinner" style={{ width: '16px', height: '16px' }} /> : 'Apply'}
                    </button>
                  </div>
                  {discountError && (
                    <div style={{
                      marginTop: '8px', fontSize: '0.78rem', color: '#f87171',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      animation: 'fadeIn 0.2s ease',
                    }}>
                      <span>⚠️</span> {discountError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ===== PRICE SUMMARY ===== */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              padding: '16px',
              marginBottom: '20px',
            }}>
              <div style={{
                fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '10px',
              }}>
                Ringkasan Harga
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Harga {promo ? '(Promo)' : ''}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatPrice(displayPrice)}</span>
                </div>
                {discountInfo && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.75rem' }}>🎟️</span> Diskon [{discountInfo.code}]
                    </span>
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>-{formatPrice(discountInfo.discount_amount)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Total Bayar</span>
                  <span style={{
                    color: discountInfo ? '#4ade80' : 'var(--brand-success)',
                    fontWeight: 800, fontSize: '1.1rem',
                  }}>
                    {formatPrice(finalDisplayPrice)}
                  </span>
                </div>
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
                {submitting ? <span className="loading-spinner" /> : `🛒 Konfirmasi & Bayar ${formatPrice(finalDisplayPrice)}`}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ background: 'transparent', border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)' }}
                onClick={() => { localStorage.removeItem('buyer_session'); router.push(`/buyer/login?redirect=/order/${product.id}`); }}
              >
                Bukan {buyer?.name}? Ganti akun
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
