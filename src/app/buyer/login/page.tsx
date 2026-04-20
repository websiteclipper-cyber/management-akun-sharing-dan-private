'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/lib/locale-context';
import Link from 'next/link';

export default function BuyerLoginPageWrapper() {
  return (
    <Suspense fallback={<div className="public-layout"><div className="loading-page"><div className="loading-spinner" /></div></div>}>
      <BuyerLoginPage />
    </Suspense>
  );
}

function BuyerLoginPage() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/buyer/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('login_error'));
        setLoading(false);
        return;
      }

      // Store JWT token + buyer session
      if (data.token) {
        localStorage.setItem('buyer_token', data.token);
      }
      localStorage.setItem('buyer_session', JSON.stringify(data.buyer));

      // Redirect
      router.push(redirect);
    } catch {
      setError(t('login_error_generic'));
      setLoading(false);
    }
  }

  return (
    <div className="public-layout">
      <header className="public-header">
        <Link href="/" className="brand">✦ pastipremium.store</Link>
      </header>

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <div className="order-form-card" style={{ maxWidth: '440px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>👤</div>
            <h2 style={{ marginBottom: '8px' }}>{t('login_title')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('login_subtitle')}
            </p>
          </div>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">{t('login_name')}</label>
              <input
                className="form-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={t('login_name_placeholder')}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('login_phone')}</label>
              <input
                className="form-input"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder={t('login_phone_placeholder')}
                required
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {t('login_phone_desc')}
              </p>
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading}
            >
              {loading ? <span className="loading-spinner" /> : t('login_submit')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {t('login_safe')}
          </div>
        </div>
      </div>
    </div>
  );
}
