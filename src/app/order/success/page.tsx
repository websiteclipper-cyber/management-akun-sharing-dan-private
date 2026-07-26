'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale } from '@/lib/locale-context';
import Link from 'next/link';

export default function PaymentSuccessWrapper() {
  return (
    <Suspense fallback={<div className="public-layout"><div className="loading-page"><div className="loading-spinner" /></div></div>}>
      <PaymentSuccessPage />
    </Suspense>
  );
}

function PaymentSuccessPage() {
  const { t, formatPrice } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderNumber = searchParams.get('order') || '';

  const [status, setStatus] = useState<'waiting' | 'paid' | 'delivered' | 'error'>('waiting');
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [product, setProduct] = useState<Record<string, unknown> | null>(null);
  const [assignments, setAssignments] = useState<Array<Record<string, unknown>>>([]);
  const [pollCount, setPollCount] = useState(0);
  const [showManualCheck, setShowManualCheck] = useState(false);

  const checkOrderStatus = useCallback(async () => {
    if (!orderNumber) return;

    const token = localStorage.getItem('buyer_token') || '';
    const response = await fetch(`/api/buyer/orders?order=${encodeURIComponent(orderNumber)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = response.ok ? await response.json() : null;
    const orderData = data?.orders?.[0];

    if (!orderData) {
      setStatus('error');
      return;
    }

    setOrder(orderData);
    setProduct(orderData.product as Record<string, unknown>);

    // Check if paid or delivered
    if (orderData.payment_status === 'paid' || orderData.order_status === 'delivered' || orderData.order_status === 'completed') {
      // Mark local storage to disable newcomer promo in the future for this browser
      localStorage.setItem('pastipremium_newcomer_claimed', '1');

      const assignData = orderData.assignments;

      if (assignData && assignData.length > 0) {
        setAssignments(assignData);
        setStatus('delivered');
      } else {
        setStatus('paid');
      }
    }
  }, [orderNumber]);

  // Active check: call our API which queries Pakasir directly
  const checkPakasirDirectly = useCallback(async () => {
    if (!orderNumber) return;
    try {
      const res = await fetch('/api/public/check-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_number: orderNumber }),
      });
      const data = await res.json();
      if (data.status === 'paid' || data.synced) {
        // Payment confirmed! Re-check order status from DB
        await checkOrderStatus();
      }
    } catch {
      // Silently fail — will retry on next poll
    }
  }, [orderNumber, checkOrderStatus]);

  // Poll every 3 seconds for status update
  useEffect(() => {
    if (!orderNumber) {
      router.push('/');
      return;
    }

    // Initial check
    checkOrderStatus();

    const interval = setInterval(() => {
      if (status === 'waiting' || status === 'paid') {
        setPollCount(prev => {
          const newCount = prev + 1;
          // Every 5th poll (every ~15s), also actively check with Pakasir API
          if (newCount % 5 === 0 && status === 'waiting') {
            checkPakasirDirectly();
          }
          return newCount;
        });
        checkOrderStatus();
      }
    }, 3000);

    // Show manual check option after 60 seconds
    const timeout = setTimeout(() => {
      setShowManualCheck(true);
    }, 60000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [orderNumber, status, checkOrderStatus, checkPakasirDirectly, router]);

  if (!orderNumber) return null;

  return (
    <div className="public-layout">
      <header className="public-header" style={{ justifyContent: 'space-between' }}>
        <Link href="/" className="brand">✦ pastipremium.my.id</Link>
      </header>

      <div className="order-form-container">
        {status === 'waiting' && (
          /* ===== WAITING FOR PAYMENT CONFIRMATION ===== */
          <div className="order-form-card" style={{ textAlign: 'center' }}>
            <div style={{
              width: '80px', height: '80px', margin: '0 auto 24px',
              borderRadius: '50%', border: '4px solid var(--border-secondary)',
              borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            <h2 style={{ marginBottom: '8px', fontSize: '1.3rem' }}>{t('success_processing')}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
              {t('success_waiting')}
              <br />{t('success_auto_update')}
            </p>

            {/* Order info */}
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-secondary)', padding: '16px', marginBottom: '20px',
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Order #{orderNumber}
              </div>
              {product && (
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {product.name as string}
                </div>
              )}
              {order && (
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--brand-success)', marginTop: '8px' }}>
                  {formatPrice(order.total_amount as number)}
                </div>
              )}
            </div>

            {/* Progress dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: pollCount % 3 === i ? 'var(--accent)' : 'var(--border-secondary)',
                  transition: 'background 0.3s',
                }} />
              ))}
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t('success_checking')} ({pollCount}x)
            </p>

            {showManualCheck && (
              <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--brand-warning)', marginBottom: '12px' }}>
                  {t('success_payment_timeout')}
                </p>
                <Link href={`/buyer/lookup?order=${orderNumber}`} className="btn btn-secondary btn-sm">
                  {t('success_manual_check')}
                </Link>
              </div>
            )}
          </div>
        )}

        {status === 'paid' && (
          /* ===== PAID BUT ACCOUNT NOT YET ASSIGNED ===== */
          <div className="order-form-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
            <h2 style={{ marginBottom: '8px', color: 'var(--brand-success)' }}>{t('success_paid')}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
              {t('success_preparing')}
            </p>
            <div className="loading-spinner" style={{ margin: '0 auto 20px' }} />
            <Link href={`/buyer/lookup?order=${orderNumber}`} className="btn btn-primary">
              {t('success_view_orders')}
            </Link>
          </div>
        )}

        {status === 'delivered' && (
          /* ===== ACCOUNT DELIVERED - SHOW CREDENTIALS ===== */
          <div className="order-form-card">
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{
                width: '70px', height: '70px', margin: '0 auto 16px',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem',
              }}>🎉</div>
              <h2 style={{ marginBottom: '4px', color: 'var(--brand-success)', fontSize: '1.4rem' }}>
                {t('success_paid')}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('success_save')}
              </p>
            </div>

            {/* Order Summary */}
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-secondary)', padding: '14px 16px', marginBottom: '20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                  {orderNumber}
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  {(product?.name as string) || '-'}
                </div>
              </div>
              <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>{t('success_paid_label')}</span>
            </div>

            {/* Account Credentials */}
            {assignments.length > 0 ? (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  {t('success_account_title')}
                </div>
                {assignments.map((a, i) => {
                  const stock = a.stock_account as Record<string, unknown>;
                  return (
                    <div key={i} style={{
                      background: 'var(--accent-soft)',
                      border: '1px solid rgba(0,122,255,0.2)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '20px',
                      marginBottom: '12px',
                    }}>
                      {/* Email / Username */}
                      <CredentialField
                        label={t('cred_email')}
                        value={stock?.account_identifier as string}
                        copyLabel={t('cred_copy')}
                        copiedLabel={t('cred_copied')}
                      />

                      {/* Password */}
                      <CredentialFieldDecrypt
                        label={t('cred_password')}
                        encrypted={stock?.account_secret_encrypted as string}
                        revealLabel={t('cred_reveal')}
                        copyLabel={t('cred_copy')}
                        copiedLabel={t('cred_copied')}
                      />

                      {/* Profile Info */}
                      {Boolean(stock?.profile_info) && (
                        <CredentialField
                          label={t('cred_profile')}
                          value={String(stock.profile_info)}
                          copyLabel={t('cred_copy')}
                          copiedLabel={t('cred_copied')}
                        />
                      )}

                      {/* PIN */}
                      {Boolean(stock?.pin_info) && (
                        <CredentialField
                          label={t('cred_pin')}
                          value={String(stock.pin_info)}
                          copyLabel={t('cred_copy')}
                          copiedLabel={t('cred_copied')}
                        />
                      )}

                      {/* Expiry */}
                      <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--brand-warning)' }}>
                        {t('success_valid_until')} <strong>{new Date(a.expired_at as string).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                <p>{t('success_admin_preparing')}</p>
                <div className="loading-spinner" style={{ margin: '12px auto' }} />
              </div>
            )}

            {/* Important Notice — dynamic by account type */}
            {(product?.account_type as string) === 'sharing' ? (
              <div style={{
                background: 'rgba(255, 59, 48, 0.05)', border: '1px solid rgba(255, 59, 48, 0.2)',
                borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginTop: '16px', marginBottom: '20px',
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--brand-danger)', fontWeight: 600, marginBottom: '4px' }}>{t('success_sharing_warning_title')}</div>
                <ul style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, paddingLeft: '16px', lineHeight: 1.6 }}>
                  <li><strong style={{ color: 'var(--brand-danger)' }}>{t('success_sharing_rule_1').split(' ')[0]}</strong> {t('success_sharing_rule_1').substring(t('success_sharing_rule_1').indexOf(' ') + 1)}</li>
                  <li>{t('success_sharing_rule_2')}</li>
                  <li>{t('success_sharing_rule_3')}</li>
                  <li>{t('success_sharing_rule_4')}</li>
                </ul>
              </div>
            ) : (
              <div style={{
                background: 'rgba(255, 204, 0, 0.05)', border: '1px solid rgba(255, 204, 0, 0.2)',
                borderRadius: 'var(--radius-lg)', padding: '14px 16px', marginTop: '16px', marginBottom: '20px',
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--brand-warning)', fontWeight: 600, marginBottom: '4px' }}>{t('success_private_warning_title')}</div>
                <ul style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, paddingLeft: '16px', lineHeight: 1.6 }}>
                  <li>{t('success_private_rule_1')}</li>
                  <li>{t('success_private_rule_2')}</li>
                  <li>{t('success_private_rule_3')}</li>
                  <li>{t('success_private_rule_4')}</li>
                </ul>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Link href={`/buyer/lookup?order=${orderNumber}`} className="btn btn-primary">
                {t('success_view_orders')}
              </Link>
              <Link href="/" className="btn btn-secondary">
                {t('success_back_home')}
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="order-form-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>❌</div>
            <h2>{t('success_not_found')}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>{t('success_not_found_desc', { order: orderNumber })}</p>
            <Link href="/" className="btn btn-primary">{t('success_back')}</Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Credential Components ===== */

function CredentialField({ label, value, copyLabel, copiedLabel }: { label: string; value: string; copyLabel?: string; copiedLabel?: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-secondary)', marginBottom: '8px',
    }}>
      <div>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</div>
      </div>
      <button
        onClick={copy}
        style={{
          background: copied ? 'rgba(22,163,74,0.12)' : 'var(--bg-secondary)',
          border: `1px solid ${copied ? 'rgba(22,163,74,0.35)' : 'var(--border-primary)'}`,
          borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem',
          cursor: 'pointer', color: copied ? 'var(--brand-success)' : 'var(--text-primary)',
          fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap',
        }}
      >
        {copied ? (copiedLabel || '✅ Copied') : (copyLabel || '📋 Copy')}
      </button>
    </div>
  );
}

function CredentialFieldDecrypt({ label, encrypted, revealLabel, copyLabel, copiedLabel }: { label: string; encrypted: string; revealLabel?: string; copyLabel?: string; copiedLabel?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      const res = await fetch('/api/buyer/decrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('buyer_token') || ''}`,
        },
        body: JSON.stringify({ encrypted }),
      });
      const data = await res.json();
      setPassword(data.decrypted || '••••••••');
      setRevealed(true);
    } catch {
      setPassword('Error');
    }
    setLoading(false);
  }

  function copy() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-secondary)', marginBottom: '8px',
    }}>
      <div>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
          {revealed ? password : '••••••••••'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {!revealed ? (
          <button
            onClick={reveal}
            disabled={loading}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
              borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem',
              cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            {loading ? '...' : (revealLabel || '👁️ Lihat')}
          </button>
        ) : (
          <button
            onClick={copy}
            style={{
              background: copied ? 'rgba(22,163,74,0.12)' : 'var(--bg-secondary)',
              border: `1px solid ${copied ? 'rgba(22,163,74,0.35)' : 'var(--border-primary)'}`,
              borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem',
              cursor: 'pointer', color: copied ? 'var(--brand-success)' : 'var(--text-primary)',
              fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            {copied ? (copiedLabel || '✅ Copied') : (copyLabel || '📋 Copy')}
          </button>
        )}
      </div>
    </div>
  );
}
