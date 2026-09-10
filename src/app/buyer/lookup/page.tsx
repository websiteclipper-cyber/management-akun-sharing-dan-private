'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale } from '@/lib/locale-context';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import PurchaseInvoice from '@/components/PurchaseInvoice';
import BuyerCredentialField from '@/components/BuyerCredentialField';
import { FiArrowLeft, FiSearch, FiShield, FiUser } from 'react-icons/fi';
import styles from '../buyer-flow.module.css';

interface BuyerSession {
  id: number;
  name: string;
  email: string;
  phone: string;
}

export default function BuyerLookupPageWrapper() {
  return (
    <Suspense fallback={<div className="public-layout"><div className="loading-page"><div className="loading-spinner" /></div></div>}>
      <BuyerLookupPage />
    </Suspense>
  );
}

function BuyerLookupPage() {
  const { t, formatPrice } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [buyer, setBuyer] = useState<BuyerSession | null>(null);
  const [orderNumber, setOrderNumber] = useState(searchParams.get('order') || '');
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const assignments = (selectedOrder?.assignments as Array<Record<string, unknown>>) || [];

  const loadAllOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      const token = localStorage.getItem('buyer_token') || '';
      const response = await fetch('/api/buyer/orders', {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        if (!silent) setOrders([]);
        return;
      }

      const data = await response.json();
      const freshOrders = (data.orders || []) as Array<Record<string, unknown>>;
      setOrders(freshOrders);
      setSelectedOrder(current => {
        if (!current) return null;

        return freshOrders.find(order => order.id === current.id)
          || freshOrders.find(order => order.order_number === current.order_number)
          || current;
      });
    } catch {
      if (!silent) setOrders([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  async function handleLogout() {
    localStorage.removeItem('buyer_session');
    localStorage.removeItem('buyer_token');
    await supabase.auth.signOut({ scope: 'local' });
    router.push('/buyer/login');
  }

  useEffect(() => {
    const session = localStorage.getItem('buyer_session');
    if (!session) {
      router.push('/buyer/login?redirect=/buyer/lookup');
      return;
    }
    const parsed = JSON.parse(session);
    setBuyer(parsed);
    void loadAllOrders();
  }, [router, loadAllOrders]);

  useEffect(() => {
    const refreshOrders = () => {
      if (
        document.visibilityState === 'visible'
        && localStorage.getItem('buyer_session')
      ) {
        void loadAllOrders(true);
      }
    };

    const interval = window.setInterval(refreshOrders, 5000);
    window.addEventListener('focus', refreshOrders);
    document.addEventListener('visibilitychange', refreshOrders);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOrders);
      document.removeEventListener('visibilitychange', refreshOrders);
    };
  }, [loadAllOrders]);

  useEffect(() => {
    if (searchParams.get('order') && orders.length > 0) {
      const found = orders.find((order) => order.order_number === searchParams.get('order'));
      if (found) {
        selectOrder(found);
      }
    }
  }, [orders, searchParams]);

  function selectOrder(order: Record<string, unknown>) {
    setSelectedOrder(order);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    setSearching(true);
    setError('');

    const found = orders.find((order) => order.order_number === orderNumber.trim());
    if (found) {
      selectOrder(found);
    } else {
      setError(t('lookup_not_found'));
      setSelectedOrder(null);
    }
    setSearching(false);
  }

  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      pending: 'badge-neutral', paid: 'badge-info', assigned: 'badge-primary',
      delivered: 'badge-success', completed: 'badge-success', cancelled: 'badge-danger',
      refunded: 'badge-warning', pending_payment: 'badge-neutral', failed: 'badge-danger',
    };
    return map[status] || 'badge-neutral';
  }

  const statusSteps = ['pending', 'paid', 'assigned', 'delivered', 'completed'];
  const currentStatusIndex = selectedOrder ? statusSteps.indexOf(selectedOrder.order_status as string) : -1;

  const stepLabels: Record<string, string> = {
    pending: t('lookup_step_pending'),
    paid: t('lookup_step_paid'),
    assigned: t('lookup_step_assigned'),
    delivered: t('lookup_step_delivered'),
    completed: t('lookup_step_completed'),
  };

  return (
    <div className={`public-layout ${styles.page}`}>
      <header className={`public-header ${styles.header}`} style={{ justifyContent: 'space-between' }}>
        <Link href="/" className={`brand ${styles.brand}`}><span>PP</span> PastiPremium</Link>
        {buyer && (
          <div className={styles.headerActions} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Link href="/warranty" className={`btn btn-secondary btn-sm ${styles.warrantyButton}`} style={{ textDecoration: 'none', background: 'rgba(147, 51, 234, 0.1)', color: '#c084fc', border: '1px solid rgba(147, 51, 234, 0.3)' }}>
              <FiShield aria-hidden="true" /> Klaim Garansi
            </Link>
            <span className={styles.buyerName} style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}><FiUser aria-hidden="true" /> {buyer.name}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => void handleLogout()}>{t('header_logout')}</button>
          </div>
        )}
      </header>

      <div className={`status-container ${styles.portalShell}`}>
        <div className={styles.portalIntro}>
          <span className={styles.eyebrow}>PORTAL PEMBELI</span>
          <h1>Pesanan Saya</h1>
          <p>Pantau transaksi, lihat detail akun, dan akses bantuan dari satu halaman.</p>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <Link href="/" className="btn btn-secondary" style={{ display: 'inline-flex', gap: '8px', padding: '8px 16px', fontSize: '0.9rem', borderRadius: 'var(--radius-full)' }}>
            <FiArrowLeft aria-hidden="true" /> {t('lookup_back_home')}
          </Link>
        </div>

        {/* Search bar */}
        <div className={`status-card ${styles.searchCard}`} style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '16px' }}>{t('lookup_title')}</h2>
          <form className={styles.searchForm} onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
            <input
              className="form-input"
              value={orderNumber}
              onChange={e => setOrderNumber(e.target.value)}
              placeholder={t('lookup_search_placeholder')}
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={searching}>
              {searching ? <span className="loading-spinner" /> : <><FiSearch aria-hidden="true" /> {t('lookup_search')}</>}
            </button>
          </form>
          {error && <div className="login-error" style={{ marginTop: '8px' }}>{error}</div>}
        </div>

        {/* Order Detail View */}
        {selectedOrder && (
          <div className={`status-card ${styles.orderDetail}`} style={{ marginBottom: '20px' }}>
            <div className={styles.detailHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedOrder(null)}
                  style={{ marginBottom: '8px', background: 'transparent', border: 'none', padding: 0, color: 'var(--brand-primary-light)', fontSize: '0.85rem' }}
                >
                  {t('lookup_back_list')}
                </button>
                <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: 'var(--brand-primary-light)' }}>
                  {selectedOrder.order_number as string}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {new Date(selectedOrder.created_at as string).toLocaleString('id-ID')}
                </div>
              </div>
              <span className={`badge ${getStatusBadge(selectedOrder.order_status as string)}`} style={{ fontSize: '0.8rem' }}>
                {selectedOrder.order_status as string}
              </span>
            </div>

            <div style={{ display: 'grid', gap: '8px', marginBottom: '20px' }}>
              <div><span className="form-label">{t('lookup_col_product')}:</span> <span style={{ color: 'var(--text-primary)' }}>{((selectedOrder.product as Record<string, unknown>)?.name as string) || '-'}</span></div>
              <div><span className="form-label">{t('lookup_col_total')}:</span> <span style={{ color: 'var(--brand-success)', fontWeight: 700 }}>{formatPrice(selectedOrder.total_amount as number)}</span></div>
              <div><span className="form-label">Payment:</span> <span className={`badge ${getStatusBadge(selectedOrder.payment_status as string)}`}>{selectedOrder.payment_status as string}</span></div>
            </div>

            {(selectedOrder.payment_status === 'paid' || ['paid', 'assigned', 'delivered', 'completed'].includes(selectedOrder.order_status as string)) && (
              <PurchaseInvoice
                order={selectedOrder}
                productName={((selectedOrder.product as Record<string, unknown>)?.name as string) || '-'}
                buyerName={buyer?.name || '-'}
              />
            )}

            {/* Pay now CTA for pending orders */}
            {(selectedOrder.payment_status === 'pending_payment' || selectedOrder.payment_status === 'pending') && (
              <div className={styles.paymentCallout} style={{ background: 'var(--accent-soft)', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  {t('lookup_pay_now')}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  {t('lookup_pay_now_desc')}
                </p>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
                  onClick={() => {
                    router.push(`/order/payment?order=${encodeURIComponent(String(selectedOrder.order_number))}`);
                  }}
                >
                  {t('lookup_pay_qris')}
                </button>
              </div>
            )}

            {/* Status Timeline */}
            <div className="status-timeline">
              <h4 style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 700 }}>{t('lookup_progress')}</h4>
              {statusSteps.map((step, i) => (
                <div key={step} className="timeline-item">
                  <div className={`timeline-dot ${i < currentStatusIndex ? 'active' : i === currentStatusIndex ? 'current' : ''}`} />
                  <div>
                    <div style={{ fontWeight: 600, textTransform: 'capitalize', color: i <= currentStatusIndex ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {stepLabels[step] || step}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Account Details */}
            {assignments.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 700 }}>{t('lookup_account_detail')}</h4>
                {assignments.map((a, i) => {
                  const stock = a.stock_account as Record<string, unknown>;
                  return (
                    <div key={i} className="assignment-card">
                      <div className={styles.assignmentHeader} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span className={`badge ${(a.status as string) === 'active' ? 'badge-success' : 'badge-neutral'}`}>{a.status as string}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span>Expired: {new Date(a.expired_at as string).toLocaleDateString('id-ID')}</span>
                          {Boolean(a.warranty_expired_at) && (
                            <span style={{ color: 'var(--brand-primary-light)', fontWeight: 600, marginTop: '2px' }}>
                              Garansi s/d: {new Date(a.warranty_expired_at as string).toLocaleDateString('id-ID')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`credential-field ${styles.credentialField}`}>
                        <div>
                          <div className="credential-label">{t('cred_email')}</div>
                          <div className="credential-value">{stock?.account_identifier as string}</div>
                        </div>
                        <button className="copy-btn" onClick={() => navigator.clipboard.writeText(stock?.account_identifier as string)}>{t('cred_copy')}</button>
                      </div>
                      <BuyerCredentialField
                        assignmentId={Number(a.id)}
                        label={t('cred_password')}
                      />
                      {Boolean(stock?.has_two_factor_secret) && (
                        <BuyerCredentialField
                          assignmentId={Number(a.id)}
                          label="KODE 2FA.LIVE"
                          credentialType="two_factor"
                        />
                      )}
                      {Boolean(stock?.profile_info) && (
                        <div className={`credential-field ${styles.credentialField}`}>
                          <div>
                            <div className="credential-label">{t('cred_profile')}</div>
                            <div className="credential-value">{String(stock.profile_info)}</div>
                          </div>
                        </div>
                      )}
                      {Boolean(stock?.pin_info) && (
                        <div className={`credential-field ${styles.credentialField}`}>
                          <div>
                            <div className="credential-label">{t('cred_pin')}</div>
                            <div className="credential-value">{String(stock.pin_info)}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Support / Complaint via WhatsApp */}
            <SupportSection 
              buyerId={selectedOrder.buyer_id as number} 
              orderId={selectedOrder.id as number}
              orderNumber={selectedOrder.order_number as string}
              productName={((selectedOrder.product as Record<string, unknown>)?.name as string) || '-'}
              buyerName={buyer?.name || '-'}
              assignments={assignments}
            />
          </div>
        )}

        {/* Orders List */}
        {!selectedOrder && (
          <div className={`status-card ${styles.ordersCard}`}>
            {loading ? (
              <div className="loading-page"><div className="loading-spinner" /></div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🛍️</div>
                <h4>{t('lookup_no_orders')}</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('lookup_no_orders_desc')}</p>
                <Link href="/" className="btn btn-primary" style={{ marginTop: '16px' }}>{t('lookup_buy_now')}</Link>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('lookup_col_order')}</th>
                      <th>{t('lookup_col_product')}</th>
                      <th>{t('lookup_col_total')}</th>
                      <th>{t('lookup_col_status')}</th>
                      <th>{t('lookup_col_action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const product = o.product as Record<string, unknown> | undefined;
                      const orderId = String(o.id || o.order_number || '');
                      const createdAt = String(o.created_at || '');
                      const orderStatus = String(o.order_status || '');
                      return (
                      <tr key={orderId}>
                        <td>
                          <div style={{ fontFamily: 'monospace', color: 'var(--brand-primary-light)', fontWeight: 600 }}>{String(o.order_number || '')}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(createdAt).toLocaleDateString('id-ID')}</div>
                        </td>
                        <td style={{ color: 'var(--text-primary)' }}>{String(product?.name || '-')}</td>
                        <td style={{ color: 'var(--brand-success)', fontWeight: 600 }}>{formatPrice(Number(o.total_amount || 0))}</td>
                        <td><span className={`badge ${getStatusBadge(orderStatus)}`}>{orderStatus}</span></td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => selectOrder(o)}>
                            {t('lookup_view_detail')}
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SupportSection({ orderNumber, productName, buyerName }: {
  buyerId: number;
  orderId: number;
  orderNumber: string;
  productName: string;
  buyerName: string;
  assignments: Array<Record<string, unknown>>;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [waNumber, setWaNumber] = useState('');
  const [loadingWa, setLoadingWa] = useState(true);
  const [complaintType, setComplaintType] = useState('');

  useEffect(() => {
    fetch('/api/public/settings')
      .then(res => res.json())
      .then(data => {
        setWaNumber(data.support_whatsapp || '082244046330');
      })
      .catch(() => setWaNumber('082244046330'))
      .finally(() => setLoadingWa(false));
  }, []);

  function openWhatsApp() {
    let phone = waNumber.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) phone = '62' + phone.substring(1);

    const issueText = complaintType || 'Issue with account';
    const text = `Halo Admin pastipremium.my.id,\n\nSaya ingin melaporkan masalah:\n\n📋 *Order:* ${orderNumber}\n📦 *Produk:* ${productName}\n👤 *Nama:* ${buyerName}\n⚠️ *Masalah:* ${issueText}\n\nMohon bantuannya. Terima kasih! 🙏`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  }

  const complaintOptions = [
    { value: t('support_login_failed'), icon: '🔑' },
    { value: t('support_no_access'), icon: '🚫' },
    { value: t('support_expired_early'), icon: '⏰' },
    { value: t('support_wrong_profile'), icon: '👤' },
    { value: t('support_other'), icon: '❓' },
  ];

  return (
    <div className={styles.support} style={{ marginTop: '24px', borderTop: '1px solid var(--border-secondary)', paddingTop: '24px' }}>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>
        {t('support_title')}
      </h4>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
        {t('support_subtitle')}
      </p>

      {/* Complaint type selector */}
      <div className={styles.supportOptions} style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
        {complaintOptions.map(opt => (
          <button
            key={opt.value}
            className={styles.supportOption}
            onClick={() => setComplaintType(opt.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 16px', borderRadius: 'var(--radius-md)',
              background: complaintType === opt.value ? 'rgba(37,211,102,0.12)' : 'var(--bg-secondary)',
              border: complaintType === opt.value ? '1px solid rgba(37,211,102,0.4)' : '1px solid var(--border-secondary)',
              color: 'var(--text-primary)', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: complaintType === opt.value ? 600 : 400,
              textAlign: 'left', transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>{opt.icon}</span>
            {opt.value}
            {complaintType === opt.value && (
              <span style={{ marginLeft: 'auto', color: '#25D366', fontWeight: 700 }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {/* WhatsApp & Auto Warranty buttons */}
      <div className={styles.supportActions} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <button
          onClick={openWhatsApp}
          disabled={!complaintType || loadingWa}
          className={`btn btn-lg ${styles.supportAction}`}
          style={{
            width: '100%', justifyContent: 'center',
            background: complaintType ? '#25D366' : 'var(--bg-tertiary)',
            color: complaintType ? '#fff' : 'var(--text-muted)',
            border: 'none', fontWeight: 700, fontSize: '0.95rem',
            padding: '14px', transition: 'all 0.3s',
            opacity: complaintType ? 1 : 0.6,
            cursor: complaintType ? 'pointer' : 'not-allowed',
          }}
        >
          {loadingWa ? <span className="loading-spinner" /> : t('support_chat_wa')}
        </button>

        <button
          onClick={() => {
            router.push(`/warranty?order=${orderNumber}`);
          }}
          className={`btn btn-lg ${styles.supportAction}`}
          style={{
            width: '100%', justifyContent: 'center',
            background: 'linear-gradient(135deg, #9333ea, #7e22ce)',
            color: '#fff',
            border: 'none', fontWeight: 700, fontSize: '0.95rem',
            padding: '14px', transition: 'all 0.3s',
            cursor: 'pointer',
            boxShadow: '0 4px 14px 0 rgba(147, 51, 234, 0.39)',
          }}
        >
          🛡️ Ajukan Klaim Garansi
        </button>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
        {t('support_wa_desc')} atau ajukan klaim garansi untuk ditinjau admin.
      </p>
    </div>
  );
}
