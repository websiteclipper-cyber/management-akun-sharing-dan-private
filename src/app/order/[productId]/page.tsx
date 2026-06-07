'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';
import { useLocale } from '@/lib/locale-context';
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
  const { t, formatPrice, isIDR, currency } = useLocale();
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [buyer, setBuyer] = useState<BuyerSession | null>(null);
  const [promo, setPromo] = useState<any>(null);
  const [isNewcomer, setIsNewcomer] = useState(false);
  const [result, setResult] = useState<{ order_number: string; amount: number; discount_amount?: number; quantity?: number } | null>(null);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1);

  // Discount code states
  const [discountCode, setDiscountCode] = useState('');
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [discountError, setDiscountError] = useState('');
  const [discountLoading, setDiscountLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const session = localStorage.getItem('buyer_session');
    if (!session) {
      router.push(`/buyer/login?redirect=/order/${params.productId}`);
      return;
    }
    const parsedBuyer = JSON.parse(session);
    setBuyer(parsedBuyer);

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

      // Check if buyer is a newcomer (no paid orders yet)
      const locallyClaimed = localStorage.getItem('pastipremium_newcomer_claimed');
      if (locallyClaimed === '1') {
        setIsNewcomer(false);
      } else if (parsedBuyer?.id) {
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', parsedBuyer.id)
          .eq('payment_status', 'paid');
        setIsNewcomer(count === 0 || count === null);
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
        setDiscountError(data.error || t('order_promo_invalid'));
      } else {
        setDiscountInfo(data);
      }
    } catch {
      setDiscountError(t('order_promo_error'));
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
    if (!buyer || !agreed) return;
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
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('order_submit_error')); setSubmitting(false); return; }
      setResult({ order_number: data.order_number, amount: data.amount, discount_amount: data.discount_amount, quantity: data.quantity });
    } catch {
      setError(t('order_connection_error'));
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

  function formatPriceIDR(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  if (loading) return <div className="public-layout"><div className="loading-page"><div className="loading-spinner" /></div></div>;
  if (!product) return <div className="public-layout"><div className="empty-state"><h3>{t('order_product_notfound')}</h3><Link href="/" className="btn btn-primary">{t('order_back_home')}</Link></div></div>;

  // Newcomer price takes priority if buyer is first-time and product has newcomer_price
  const hasNewcomerPrice = isNewcomer && product.newcomer_price !== null && product.newcomer_price !== undefined;
  const normalPrice = promo ? promo.promo_price : product.price;
  
  let totalBasePrice = normalPrice * quantity;
  if (hasNewcomerPrice) {
    totalBasePrice = product.newcomer_price! + (normalPrice * (quantity - 1));
  }

  let totalDiscountAmount = 0;
  if (discountInfo) {
    if (discountInfo.discount_type === 'percentage') {
      totalDiscountAmount = Math.round(totalBasePrice * discountInfo.discount_value / 100);
    } else {
      totalDiscountAmount = discountInfo.discount_value * quantity;
    }
    totalDiscountAmount = Math.min(totalDiscountAmount, totalBasePrice);
  }

  const finalDisplayPrice = totalBasePrice - totalDiscountAmount;

  return (
    <div className="public-layout">
      <header className="public-header" style={{ justifyContent: 'space-between' }}>
        <Link href="/" className="brand">✦ pastipremium.my.id</Link>
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
              <h2 style={{ marginBottom: '8px' }}>{t('payment_continue')}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('payment_created')}
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
                  <span>{t('payment_pay_qris')}</span>
                </span>
              </button>
              <div style={{ textAlign: 'center', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--brand-success)', fontWeight: 600 }}>{t('payment_auto')}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('payment_auto_desc')}</span>
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
                {t('payment_later')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="order-form-card">
            <Link href="/" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              marginBottom: '16px',
              fontWeight: 500,
              transition: 'color 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {t('order_back')}
            </Link>
            <h2>{t('order_confirm')}</h2>
            <div className="order-product-summary">
              <div className="platform" style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--brand-accent)' }}>
                {product.platform_name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{product.name}</h4>
                {hasNewcomerPrice ? (
                  <span className="badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 700, animation: 'pulse 2s infinite' }}>
                    🆕 BUYER BARU
                  </span>
                ) : promo ? (
                  <span className="badge badge-danger" style={{ animation: 'pulse 2s infinite' }}>
                    {promo.promo_label.toUpperCase()}
                  </span>
                ) : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                {hasNewcomerPrice ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="price" style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                        {formatPrice(product.price)}
                      </span>
                      <span className="price" style={{ color: '#3b82f6' }}>{formatPrice(product.newcomer_price!)}</span>
                    </div>
                    {quantity > 1 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        +( {quantity - 1}x {formatPrice(normalPrice)} )
                      </div>
                    )}
                  </div>
                ) : promo ? (
                  <>
                    <span className="price" style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                      {formatPrice(promo.original_price)}
                    </span>
                    <span className="price" style={{ color: 'var(--brand-danger)' }}>{formatPrice(normalPrice)}</span>
                  </>
                ) : (
                  <span className="price">{formatPrice(product.price)}</span>
                )}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/ {product.duration_days} {t('days')}</span>
                <span className={`badge ${product.account_type === 'sharing' ? 'badge-info' : 'badge-primary'}`}>{product.account_type}</span>
              </div>
            </div>

            {/* Buyer Info */}
            <div style={{ background: 'rgba(108,92,231,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                {t('order_buyer_data')}
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('order_name')}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{buyer?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('order_whatsapp')}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{buyer?.phone}</span>
                </div>
              </div>
            </div>

            {/* ===== QUANTITY SELECTOR ===== */}
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
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <span>📦</span> {t('order_quantity')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    border: '1px solid var(--border-primary)',
                    background: quantity <= 1 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                    color: quantity <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: '1.2rem', fontWeight: 700, cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                    opacity: quantity <= 1 ? 0.4 : 1,
                  }}
                >−</button>
                <div style={{
                  minWidth: '48px', textAlign: 'center',
                  fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}>{quantity}</div>
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.min(10, q + 1))}
                  disabled={quantity >= 10}
                  style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    border: '1px solid var(--border-primary)',
                    background: quantity >= 10 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                    color: quantity >= 10 ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: '1.2rem', fontWeight: 700, cursor: quantity >= 10 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                    opacity: quantity >= 10 ? 0.4 : 1,
                  }}
                >+</button>
                {quantity > 1 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {t('order_qty_items', { qty: String(quantity) })}
                  </span>
                )}
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
                <span>🎟️</span> {t('order_promo_code')}
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
                    {t('order_remove')}
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
                      placeholder={t('order_enter_promo')}
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
                      {discountLoading ? <span className="loading-spinner" style={{ width: '16px', height: '16px' }} /> : t('order_apply')}
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
                {t('order_price_summary')}
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('order_price')} {hasNewcomerPrice ? t('order_newcomer_label') : promo ? t('order_promo_label') : ''}</span>
                  <span style={{ color: hasNewcomerPrice ? '#3b82f6' : 'var(--text-primary)', fontWeight: 600 }}>{formatPrice(totalBasePrice)}</span>
                </div>
                {hasNewcomerPrice && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                      <span>🎉</span> {t('order_first_purchase_special')}
                    </span>
                    <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: '0.78rem' }}>{t('order_save')} {formatPrice(product.price - product.newcomer_price!)}</span>
                  </div>
                )}
                {discountInfo && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.75rem' }}>🎟️</span> {t('order_discount')} [{discountInfo.code}]
                    </span>
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>-{formatPrice(totalDiscountAmount)}</span>
                  </div>
                )}
                {quantity > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('order_quantity')}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>×{quantity}</span>
                  </div>
                )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Rata-rata per item</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatPrice(finalDisplayPrice / quantity)} / item</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{t('order_total')}{quantity > 1 ? ` (${quantity} item)` : ''}</span>
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

            {/* ===== CUSTOM PRODUCT TERMS ===== */}
            {product.terms && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.05)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                padding: '16px',
                marginBottom: '20px',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                color: 'var(--text-primary)',
                animation: 'fadeIn 0.3s ease'
              }}>
                <h4 style={{ color: 'var(--accent)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <span>📋</span> Ketentuan & Catatan Khusus {product.name}
                </h4>
                <div style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {product.terms}
                </div>
              </div>
            )}

            {/* ===== TERMS AND CONDITIONS ===== */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.05)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              padding: '16px',
              marginBottom: '20px',
              fontSize: '0.85rem',
              lineHeight: '1.5',
              color: 'var(--text-primary)'
            }}>
              <h4 style={{ color: 'var(--brand-danger)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Catatan Penting & Ketentuan Garansi untuk Pembeli Akun Premium
              </h4>
              <p style={{ marginBottom: '8px' }}>Halo! Terima kasih sudah memilih kami untuk mendapatkan akun premium dengan harga jauh lebih murah dibanding harga resminya. Sebelum kamu lanjut checkout, mohon baca catatan ini dengan teliti ya:</p>
              <ul style={{ paddingLeft: '20px', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>Akun ini diperoleh melalui promo trial resmi yang sedang berjalan (event harga murah terbatas waktu). Harga super hemat yang kamu bayar ini karena memanfaatkan kesempatan trial tersebut.</li>
                <li><strong>Garansi yang berlaku hanya 1 jenis saja:</strong> Jika masa aktif akun habis secara normal (expired sesuai masa trial), kami akan ganti dengan akun baru gratis.</li>
                <li><strong>Tidak ada garansi jika akun terblokir / dibanned oleh pihak resmi platform.</strong> Kondisi ini tidak tercover garansi.</li>
                <li>Setelah event/trial ini berakhir, kami tidak bisa menjamin akun tetap aktif selamanya karena sepenuhnya bergantung pada kebijakan platform.</li>
                <li>Jika akun tidak bisa digunakan lagi (selain kasus terblokir), kami akan bantu alihkan ke aplikasi/platform alternatif sejenis dengan cara paling mudah dan cepat.</li>
                <li><strong>Pembelian ini bersifat final.</strong></li>
              </ul>
              <p style={{ marginBottom: '12px' }}>Dengan membeli, kamu secara otomatis setuju dengan semua ketentuan di atas, termasuk batasan garansi yang sudah dijelaskan. Mau lanjut beli? Ketik "SETUJU" atau centang kotak di bawah ini lalu langsung checkout sekarang. Kami siap proses secepat mungkin setelah konfirmasi kamu. Salam hangat, Tim pastipremium.my.id.</p>
              <div style={{ background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--brand-primary)' }} />
                  Saya Setuju dengan ketentuan di atas
                </label>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', opacity: (!agreed || submitting) ? 0.5 : 1 }} disabled={submitting || !agreed}>
                {submitting ? <span className="loading-spinner" /> : `${t('order_confirm_pay')} ${formatPrice(finalDisplayPrice)}`}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ background: 'transparent', border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)' }}
                onClick={() => { localStorage.removeItem('buyer_session'); router.push(`/buyer/login?redirect=/order/${product.id}`); }}
              >
                {t('order_not_you', { name: buyer?.name || '' })}
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
