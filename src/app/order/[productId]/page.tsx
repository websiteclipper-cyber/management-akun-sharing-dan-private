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

interface RefreshedBuyerSession {
  token: string;
  buyer: BuyerSession;
}

interface PromoInfo {
  promo_price: number;
  promo_label: string;
  original_price: number;
}

interface DiscountInfo {
  campaign_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  base_price: number;
  total_base_price: number;
  final_price: number;
  quantity: number;
  min_quantity: number;
  fixed_discount_mode: 'per_item' | 'per_order';
}

function getAvailableStock(product: Product | null): number {
  const stock = Number(product?.available_stock || 0);
  return Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0;
}

function clearBuyerLocalSession() {
  localStorage.removeItem('buyer_session');
  localStorage.removeItem('buyer_token');
}

function readStoredBuyer(): BuyerSession | null {
  try {
    const session = localStorage.getItem('buyer_session');
    return session ? JSON.parse(session) as BuyerSession : null;
  } catch {
    return null;
  }
}

// This client-side check is only used to avoid sending a known-expired token.
// The API remains responsible for verifying the token signature and buyer identity.
function isBuyerTokenFresh(token: string): boolean {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;

    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { type?: string; exp?: number };

    return payload.type === 'buyer'
      && typeof payload.exp === 'number'
      && payload.exp > Math.floor(Date.now() / 1000) + 30;
  } catch {
    return false;
  }
}

async function refreshBuyerAppSession(): Promise<RefreshedBuyerSession | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token) return null;

    const response = await fetch('/api/buyer/auth/exchange', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });
    const data = await response.json();

    if (!response.ok || data.needs_profile || !data.token || !data.buyer) return null;

    const refreshed = data as RefreshedBuyerSession;
    localStorage.setItem('buyer_token', refreshed.token);
    localStorage.setItem('buyer_session', JSON.stringify(refreshed.buyer));
    return refreshed;
  } catch {
    return null;
  }
}

export default function OrderPage() {
  const { t, formatPrice } = useLocale();
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [buyer, setBuyer] = useState<BuyerSession | null>(null);
  const [promo, setPromo] = useState<PromoInfo | null>(null);
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
  const [preOrderNoticeOpen, setPreOrderNoticeOpen] = useState(false);
  const [preOrderAcknowledged, setPreOrderAcknowledged] = useState(false);

  useEffect(() => {
    async function load() {
      let parsedBuyer = readStoredBuyer();
      const storedToken = localStorage.getItem('buyer_token') || '';

      if (!parsedBuyer || !isBuyerTokenFresh(storedToken)) {
        const refreshed = await refreshBuyerAppSession();
        if (!refreshed) {
          clearBuyerLocalSession();
          router.replace(`/buyer/login?redirect=/order/${params.productId}`);
          return;
        }
        parsedBuyer = refreshed.buyer;
      }

      setBuyer(parsedBuyer);

      const catalogResponse = await fetch('/api/public/catalog', { cache: 'no-store' });
      const catalog = catalogResponse.ok
        ? await catalogResponse.json() as { products?: Product[]; promos?: Array<PromoInfo & { product_id: number }> }
        : null;
      const data = catalog?.products?.find((item) => String(item.id) === String(params.productId)) || null;
      setProduct(data);
      if (data) {
        const promoData = catalog?.promos?.find((item) => item.product_id === data.id);
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

  function redirectToBuyerLogin() {
    clearBuyerLocalSession();
    router.replace(`/buyer/login?redirect=/order/${params.productId}`);
  }

  async function handleBuyerLogout() {
    clearBuyerLocalSession();
    await supabase.auth.signOut({ scope: 'local' });
    router.push(`/buyer/login?redirect=/order/${params.productId}`);
  }

  async function handleApplyDiscount() {
    if (!discountCode.trim() || !product || !buyer) return;
    setDiscountLoading(true);
    setDiscountError('');
    setDiscountInfo(null);

    try {
      const payload = {
        code: discountCode.trim(),
        product_id: product.id,
        quantity,
      };

      async function validateDiscount(token: string) {
        return fetch('/api/public/discounts/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      let buyerToken = localStorage.getItem('buyer_token') || '';
      if (!isBuyerTokenFresh(buyerToken)) {
        const refreshed = await refreshBuyerAppSession();
        if (!refreshed) {
          redirectToBuyerLogin();
          return;
        }
        buyerToken = refreshed.token;
      }

      let res = await validateDiscount(buyerToken);
      if (res.status === 401) {
        const refreshed = await refreshBuyerAppSession();
        if (refreshed) res = await validateDiscount(refreshed.token);
      }

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          redirectToBuyerLogin();
          return;
        }
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

  function handleQuantityChange(nextQuantity: number) {
    const normalized = Math.min(10, Math.max(1, nextQuantity));
    if (normalized === quantity) return;

    setQuantity(normalized);
    if (discountInfo) {
      setDiscountInfo(null);
      setDiscountError('Jumlah berubah. Terapkan kembali kode promo untuk menghitung total baru.');
    }
  }

  async function submitOrder() {
    if (!buyer || !agreed || !product) return;
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
      const resellerToken = localStorage.getItem('reseller_token') || '';
      const orderPayload = {
        product_id: product!.id,
        ref_code: refCode,
        discount_code: discountInfo ? discountInfo.code : '',
        quantity,
        reseller_token: resellerToken,
      };

      async function createOrder(token: string) {
        return fetch('/api/public/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(orderPayload),
        });
      }

      let buyerToken = localStorage.getItem('buyer_token') || '';
      if (!isBuyerTokenFresh(buyerToken)) {
        const refreshed = await refreshBuyerAppSession();
        if (!refreshed) {
          redirectToBuyerLogin();
          return;
        }
        buyerToken = refreshed.token;
      }

      let res = await createOrder(buyerToken);

      // The application token may have become invalid after a deployment or
      // while the checkout page was left open. Refresh once, then retry only
      // the request that was rejected before any order could be created.
      if (res.status === 401) {
        const refreshed = await refreshBuyerAppSession();
        if (refreshed) res = await createOrder(refreshed.token);
      }

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          redirectToBuyerLogin();
          return;
        }
        setError(data.error || t('order_submit_error'));
        setSubmitting(false);
        return;
      }

      const createdOrder = {
        order_number: data.order_number,
        amount: Number(data.amount),
        discount_amount: data.discount_amount,
        quantity: data.quantity,
      };
      setResult(createdOrder);
      router.push(`/order/payment?order=${encodeURIComponent(createdOrder.order_number)}`);
    } catch {
      setError(t('order_connection_error'));
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!buyer || !agreed || !product) return;

    if (getAvailableStock(product) === 0 && !preOrderAcknowledged) {
      setPreOrderNoticeOpen(true);
      return;
    }

    void submitOrder();
  }

  function handleConfirmPreOrder() {
    setPreOrderAcknowledged(true);
    setPreOrderNoticeOpen(false);
    void submitOrder();
  }

  function handlePayWithKlikQris() {
    if (!result) return;
    router.push(`/order/payment?order=${encodeURIComponent(result.order_number)}`);
  }

  if (loading) return <div className="public-layout"><div className="loading-page"><div className="loading-spinner" /></div></div>;
  if (!product) return <div className="public-layout"><div className="empty-state"><h3>{t('order_product_notfound')}</h3><Link href="/" className="btn btn-primary">{t('order_back_home')}</Link></div></div>;

  const availableStock = getAvailableStock(product);
  const isUnavailable = product.status !== 'active';
  if (isUnavailable) {
    return (
      <div className="public-layout">
        <header className="public-header order-header">
          <Link href="/" className="brand order-brand">✦ pastipremium.my.id</Link>
        </header>
        <div className="empty-state">
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📦</div>
          <h3>SOLD OUT</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
            Stok {product.name} sedang habis dan belum dapat dibeli.
          </p>
          <Link href="/" className="btn btn-primary">Kembali ke katalog</Link>
        </div>
      </div>
    );
  }

  const maximumQuantity = 10;

  // Newcomer price takes priority if buyer is first-time and product has newcomer_price
  const hasNewcomerPrice = isNewcomer && product.newcomer_price !== null && product.newcomer_price !== undefined;
  const normalPrice = promo ? promo.promo_price : product.price;
  
  let totalBasePrice = normalPrice * quantity;
  if (hasNewcomerPrice) {
    totalBasePrice = product.newcomer_price! + (normalPrice * (quantity - 1));
  }

  if (discountInfo) totalBasePrice = Number(discountInfo.total_base_price ?? discountInfo.base_price);
  const totalDiscountAmount = discountInfo ? Number(discountInfo.discount_amount) : 0;
  const finalDisplayPrice = discountInfo
    ? Number(discountInfo.final_price)
    : totalBasePrice;

  return (
    <div className="public-layout">
      <header className="public-header order-header" style={{ justifyContent: 'space-between' }}>
        <Link href="/" className="brand order-brand">✦ pastipremium.my.id</Link>
        {buyer && (
          <div className="order-buyer-header" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className="order-buyer-name" style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>👤 {buyer.name}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => void handleBuyerLogout()}>Logout</button>
          </div>
        )}
      </header>

      <div className="order-form-container">
        {result ? (
          /* ===== PAYMENT VIA KLIKQRIS ===== */
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
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-secondary)', padding: '16px', marginBottom: '24px',
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
                    background: 'rgba(22,163,74,0.12)', color: 'var(--brand-success)', fontSize: '0.7rem',
                    fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                  }}>DISKON</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--brand-success)', fontWeight: 600 }}>
                    Hemat {formatPrice(result.discount_amount)}
                  </span>
                </div>
              )}
            </div>

            {/* KlikQRIS Payment Button */}
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
                onClick={handlePayWithKlikQris}
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
                  fontSize: '0.65rem', fontWeight: 700, background: 'var(--bg-card)',
                  border: '1px solid var(--border-secondary)', borderRadius: '8px',
                  padding: '6px 10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px',
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
            <Link href="/" className="order-back-link" style={{
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
              <div className="platform" style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--accent)' }}>
                {product.platform_name}
              </div>
              <div className="order-product-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h4 className="order-product-name" style={{ margin: 0, fontSize: '1.1rem' }}>{product.name}</h4>
                {hasNewcomerPrice ? (
                  <span className="badge" style={{ background: 'rgba(37,99,235,0.12)', color: 'var(--accent)', fontWeight: 700, animation: 'pulse 2s infinite' }}>
                    🆕 BUYER BARU
                  </span>
                ) : promo ? (
                  <span className="badge badge-danger" style={{ animation: 'pulse 2s infinite' }}>
                    {promo.promo_label.toUpperCase()}
                  </span>
                ) : null}
              </div>
              <div className="order-price-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                {hasNewcomerPrice ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="price" style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                        {formatPrice(product.price)}
                      </span>
                      <span className="price" style={{ color: 'var(--accent)' }}>{formatPrice(product.newcomer_price!)}</span>
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
            <div className="buyer-info-card" style={{ background: 'var(--accent-soft)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(0,122,255,0.2)', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                {t('order_buyer_data')}
              </div>
              <div style={{ display: 'grid', gap: '8px', fontSize: '0.9rem' }}>
                <div className="buyer-info-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('order_name')}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{buyer?.name}</span>
                </div>
                <div className="buyer-info-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('order_whatsapp')}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{buyer?.phone}</span>
                </div>
              </div>
            </div>

            <div className="quantity-card" style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-secondary)',
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
              <div className="quantity-control" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(quantity - 1)}
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
                  onClick={() => handleQuantityChange(quantity + 1)}
                  disabled={quantity >= maximumQuantity}
                  style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    border: '1px solid var(--border-primary)',
                    background: quantity >= maximumQuantity ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                    color: quantity >= maximumQuantity ? 'var(--text-muted)' : 'var(--text-primary)',
                    fontSize: '1.2rem', fontWeight: 700, cursor: quantity >= maximumQuantity ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s',
                    opacity: quantity >= maximumQuantity ? 0.4 : 1,
                  }}
                >+</button>
                {quantity > 1 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {t('order_qty_items', { qty: String(quantity) })}
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  Stok tersedia: {availableStock}
                </span>
              </div>
            </div>

            {/* ===== DISCOUNT CODE SECTION ===== */}
            <div className="discount-card" style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${discountInfo ? 'rgba(52,199,89,0.4)' : 'var(--border-secondary)'}`,
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
                <div className="discount-applied" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(52,199,89,0.08)',
                  borderRadius: 'var(--radius-md)', padding: '12px 16px',
                  border: '1px solid rgba(52,199,89,0.2)',
                }}>
                  <div className="discount-applied-content" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '1.4rem', lineHeight: 1,
                      filter: 'drop-shadow(0 0 4px rgba(52,199,89,0.4))',
                    }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--brand-success)', letterSpacing: '0.5px' }}>
                        {discountInfo.code}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {discountInfo.discount_type === 'percentage'
                          ? `Diskon ${discountInfo.discount_value}%`
                          : `Potongan ${formatPrice(discountInfo.discount_value)} ${discountInfo.fixed_discount_mode === 'per_item' ? 'per item' : 'per pesanan'}`}
                        {' '}&mdash; Hemat <strong style={{ color: 'var(--brand-success)' }}>{formatPrice(discountInfo.discount_amount)}</strong>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="discount-remove-button"
                    onClick={handleRemoveDiscount}
                    style={{
                      background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)',
                      color: 'var(--brand-danger)', borderRadius: '8px', padding: '4px 12px',
                      fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(220,38,38,0.16)')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(220,38,38,0.08)')}
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
                      marginTop: '8px', fontSize: '0.78rem', color: 'var(--brand-danger)',
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
            <div className="price-summary-card" style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-secondary)',
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
                <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('order_price')} {hasNewcomerPrice ? t('order_newcomer_label') : promo ? t('order_promo_label') : ''}</span>
                  <span style={{ color: hasNewcomerPrice ? 'var(--accent)' : 'var(--text-primary)', fontWeight: 600 }}>{formatPrice(totalBasePrice)}</span>
                </div>
                {hasNewcomerPrice && (
                  <div className="summary-row summary-row-special" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                      <span>🎉</span> {t('order_first_purchase_special')}
                    </span>
                    <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.78rem' }}>{t('order_save')} {formatPrice(product.price - product.newcomer_price!)}</span>
                  </div>
                )}
                {discountInfo && (
                  <div className="summary-row summary-row-discount" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--brand-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.75rem' }}>🎟️</span> {t('order_discount')} [{discountInfo.code}]
                    </span>
                    <span style={{ color: 'var(--brand-success)', fontWeight: 700 }}>-{formatPrice(totalDiscountAmount)}</span>
                  </div>
                )}
                {quantity > 1 && (
                  <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{t('order_quantity')}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>×{quantity}</span>
                  </div>
                )}
                {quantity > 1 && (
                  <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Rata-rata per item</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{formatPrice(finalDisplayPrice / quantity)} / item</span>
                  </div>
                )}
                <div className="summary-total" style={{ borderTop: '1px solid var(--border-primary)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{t('order_total')}{quantity > 1 ? ` (${quantity} item)` : ''}</span>
                  <span style={{
                    color: 'var(--brand-success)',
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
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.05))',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(59, 130, 246, 0.22)',
                padding: '18px',
                marginBottom: '20px',
                color: 'var(--text-primary)',
                animation: 'fadeIn 0.3s ease',
              }}>
                <h4 style={{ color: 'var(--accent)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <span>📋</span> Ketentuan & Catatan Khusus {product.name}
                </h4>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {product.terms.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => (
                    <div key={`${line}-${index}`} style={{
                      display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px',
                      borderRadius: '10px', background: 'rgba(255,255,255,0.72)', color: 'var(--text-secondary)',
                      fontSize: '0.82rem', lineHeight: 1.55,
                    }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 800, lineHeight: 1.45 }}>•</span>
                      <span>{line.replace(/^[-•\d.\s]+/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== TERMS AND CONDITIONS ===== */}
            <div style={{
              background: 'linear-gradient(145deg, rgba(255, 59, 48, 0.08), rgba(255, 149, 0, 0.04))',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid rgba(255, 59, 48, 0.24)',
              padding: '20px',
              marginBottom: '20px',
              fontSize: '0.85rem',
              lineHeight: '1.5',
              color: 'var(--text-primary)'
            }}>
              <h4 style={{ color: 'var(--brand-danger)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Catatan Penting & Ketentuan Garansi untuk Pembeli Akun Premium
              </h4>
              <p style={{ margin: '0 0 14px', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                Sebelum melanjutkan pembayaran, pastikan Anda memahami poin-poin berikut.
              </p>
              <div style={{ display: 'grid', gap: '9px', marginBottom: '16px' }}>
                {[
                  { text: 'Garansi penggantian diberikan jika akun expired normal sebelum waktunya.', tone: 'success' },
                  { text: 'Akun yang dibanned atau diblokir platform tidak termasuk garansi.', tone: 'danger' },
                  { text: 'Ketersediaan layanan setelah promo berakhir mengikuti kebijakan platform.', tone: 'neutral' },
                  { text: 'Jika layanan bermasalah selain banned, kami bantu alihkan ke alternatif sejenis.', tone: 'info' },
                  { text: 'Pembelian bersifat final sesuai ketentuan garansi.', tone: 'danger' },
                ].map(({ text, tone }) => {
                  const color = tone === 'success' ? 'var(--brand-success)' : tone === 'danger' ? 'var(--brand-danger)' : tone === 'info' ? 'var(--accent)' : 'var(--text-muted)';
                  return (
                    <div key={text} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '0.81rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                      <span style={{ color, fontWeight: 900, lineHeight: 1.4 }}>{tone === 'danger' ? '×' : '✓'}</span>
                      <span>{text}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{
                background: agreed ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.8)',
                padding: '14px', borderRadius: '12px',
                border: `1px solid ${agreed ? 'rgba(34, 197, 94, 0.35)' : 'var(--border-primary)'}`,
                transition: 'all 0.2s ease',
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.87rem', color: agreed ? 'var(--brand-success)' : 'var(--text-primary)' }}>
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: '20px', height: '20px', accentColor: 'var(--brand-success)', flexShrink: 0 }} />
                  {agreed ? 'Saya sudah membaca dan menyetujui ketentuan' : 'Saya setuju dengan seluruh ketentuan di atas'}
                </label>
                {!agreed && <p style={{ margin: '6px 0 0 30px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Centang untuk membuka tombol pembayaran.</p>}
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
                onClick={() => void handleBuyerLogout()}
              >
                {t('order_not_you', { name: buyer?.name || '' })}
              </button>
            </div>
          </div>
        )}
      </div>

      {preOrderNoticeOpen && (
        <div
          className="preorder-notice-overlay"
          role="presentation"
          onClick={() => setPreOrderNoticeOpen(false)}
        >
          <div
            className="preorder-notice-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="preorder-notice-title"
            aria-describedby="preorder-notice-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="preorder-notice-icon" aria-hidden="true">⏳</div>
            <div className="preorder-notice-badge">STOK 0 • PRE-ORDER</div>
            <h2 id="preorder-notice-title">Produk sedang menunggu restok</h2>
            <p id="preorder-notice-description">
              Stok <strong>{product.name}</strong> saat ini kosong. Jika kamu melanjutkan,
              setelah pembayaran berhasil pesananmu akan otomatis masuk ke antrean pre-order.
            </p>

            <div className="preorder-notice-info">
              <div>
                <span aria-hidden="true">🕒</span>
                <p><strong>Estimasi proses 1–24 jam</strong><br />Kami akan menyiapkan akunmu secepat mungkin.</p>
              </div>
              <div>
                <span aria-hidden="true">📦</span>
                <p><strong>Pantau di menu Pesanan Saya</strong><br />Detail akun akan muncul otomatis setelah akun dikirim.</p>
              </div>
            </div>

            <div className="preorder-notice-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPreOrderNoticeOpen(false)}
              >
                Kembali
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmPreOrder}
              >
                Lanjutkan Pre-order
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .order-product-summary {
          padding: 4px 0 2px;
        }

        .order-product-heading {
          gap: 12px;
        }

        .order-product-name {
          flex: 1;
          min-width: 0;
          line-height: 1.4;
        }

        .order-product-heading :global(.badge) {
          flex-shrink: 0;
        }

        .order-price-meta {
          flex-wrap: wrap;
          row-gap: 6px;
        }

        .buyer-info-row {
          gap: 16px;
          align-items: flex-start;
        }

        .buyer-info-row > span:last-child {
          min-width: 0;
          text-align: right;
          overflow-wrap: anywhere;
        }

        .discount-applied {
          gap: 12px;
        }

        .discount-applied-content {
          flex: 1;
          min-width: 0;
        }

        .discount-applied-content > div {
          min-width: 0;
        }

        .discount-applied-content > div > div {
          overflow-wrap: anywhere;
        }

        .discount-remove-button {
          flex-shrink: 0;
        }

        .summary-row {
          gap: 16px;
          align-items: flex-start;
        }

        .summary-row > span:first-child {
          min-width: 0;
        }

        .summary-row > span:last-child {
          flex-shrink: 0;
          text-align: right;
        }

        .preorder-notice-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(15, 23, 42, 0.62);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: preorderFadeIn 0.2s ease;
        }

        .preorder-notice-dialog {
          width: min(100%, 470px);
          padding: 30px;
          border: 1px solid rgba(245, 158, 11, 0.26);
          border-radius: 24px;
          background: var(--bg-card);
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.3);
          text-align: center;
          animation: preorderPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .preorder-notice-icon {
          display: grid;
          place-items: center;
          width: 64px;
          height: 64px;
          margin: 0 auto 14px;
          border-radius: 20px;
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.1));
          font-size: 2rem;
        }

        .preorder-notice-badge {
          display: inline-flex;
          margin-bottom: 10px;
          padding: 5px 10px;
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 999px;
          background: rgba(245, 158, 11, 0.1);
          color: #b45309;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .preorder-notice-dialog h2 {
          margin: 0 0 10px;
          color: var(--text-primary);
          font-size: 1.35rem;
          line-height: 1.3;
        }

        .preorder-notice-dialog > p {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.65;
        }

        .preorder-notice-info {
          display: grid;
          gap: 10px;
          margin: 22px 0;
          text-align: left;
        }

        .preorder-notice-info > div {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 13px 14px;
          border: 1px solid var(--border-secondary);
          border-radius: 14px;
          background: var(--bg-secondary);
        }

        .preorder-notice-info span {
          flex-shrink: 0;
          font-size: 1.1rem;
          line-height: 1.45;
        }

        .preorder-notice-info p {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.8rem;
          line-height: 1.55;
        }

        .preorder-notice-info strong {
          color: var(--text-primary);
        }

        .preorder-notice-actions {
          display: grid;
          grid-template-columns: 1fr 1.4fr;
          gap: 10px;
        }

        .preorder-notice-actions :global(.btn) {
          width: 100%;
          justify-content: center;
        }

        @keyframes preorderFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes preorderPopIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @media (max-width: 560px) {
          .order-header {
            height: auto;
            min-height: 60px;
            padding: 10px 14px;
            gap: 10px;
          }

          .order-brand {
            min-width: 0;
            white-space: nowrap;
            font-size: 1rem;
          }

          .order-buyer-header {
            min-width: 0;
            gap: 8px !important;
          }

          .order-buyer-name {
            display: block;
            max-width: 92px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .order-buyer-header :global(.btn) {
            padding: 8px 10px;
            white-space: nowrap;
          }

          .order-form-container {
            align-items: flex-start;
            padding: 20px 12px 36px;
          }

          .order-form-card {
            padding: 22px 16px;
            border-radius: 18px;
          }

          .order-back-link {
            margin-bottom: 14px !important;
          }

          .order-product-heading {
            align-items: center !important;
          }

          .order-product-name {
            font-size: 1.05rem !important;
          }

          .order-price-meta {
            gap: 6px !important;
          }

          .order-price-meta > span {
            white-space: nowrap;
          }

          .buyer-info-card,
          .quantity-card,
          .discount-card,
          .price-summary-card {
            padding: 14px !important;
            margin-bottom: 16px !important;
          }

          .buyer-info-row {
            gap: 12px;
          }

          .quantity-control {
            gap: 10px !important;
            flex-wrap: wrap;
          }

          .discount-applied {
            align-items: flex-start !important;
            padding: 12px !important;
          }

          .discount-applied-content {
            align-items: flex-start !important;
          }

          .discount-applied-content > div > div:last-child {
            line-height: 1.55;
          }

          .discount-remove-button {
            padding: 6px 10px !important;
          }

          .summary-row-discount,
          .summary-row-special {
            flex-direction: column;
            gap: 4px;
          }

          .summary-row-discount > span:last-child,
          .summary-row-special > span:last-child {
            padding-left: 20px;
            text-align: left;
          }

          .summary-total {
            gap: 12px;
            align-items: center;
          }

          .preorder-notice-overlay {
            align-items: flex-end;
            padding: 12px;
          }

          .preorder-notice-dialog {
            padding: 24px 18px 18px;
            border-radius: 22px;
          }

          .preorder-notice-actions {
            grid-template-columns: 1fr;
          }

          .preorder-notice-actions :global(.btn-primary) {
            grid-row: 1;
          }
        }
      `}</style>
    </div>
  );
}
