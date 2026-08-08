'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/lib/locale-context';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { FcGoogle } from 'react-icons/fc';

const BUYER_LOGIN_REDIRECT_KEY = 'buyer_login_redirect';

function safeInternalRedirect(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

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
  const redirect = safeInternalRedirect(searchParams.get('redirect'));
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(() => searchParams.get('error_description') || '');
  const [profileRequired, setProfileRequired] = useState(false);
  const [verifiedAccessToken, setVerifiedAccessToken] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const exchangedAccessTokenRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    const pendingTimers = new Set<number>();

    function getRedirectAfterLogin() {
      const storedRedirect = sessionStorage.getItem(BUYER_LOGIN_REDIRECT_KEY);
      return safeInternalRedirect(searchParams.get('redirect') || storedRedirect);
    }

    async function exchangeVerifiedSession(session: Session) {
      if (cancelled || !session.access_token) return;
      if (exchangedAccessTokenRef.current === session.access_token) return;
      exchangedAccessTokenRef.current = session.access_token;

      setLoading(true);
      try {
        const response = await fetch('/api/buyer/auth/exchange', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        const data = await response.json();
        if (cancelled) return;

        if (response.ok && data.needs_profile) {
          setVerifiedAccessToken(session.access_token);
          setEmail(data.email || session.user.email || '');
          setProfileName(data.profile?.name || '');
          setProfilePhone(data.profile?.phone || '');
          setProfileRequired(true);
          setError('');
          setLoading(false);
          return;
        }
        if (!response.ok || !data.token) {
          exchangedAccessTokenRef.current = '';
          setError(data.error || 'Gagal memverifikasi akun buyer.');
          setLoading(false);
          return;
        }

        localStorage.setItem('buyer_token', data.token);
        localStorage.setItem('buyer_session', JSON.stringify(data.buyer));
        const destination = getRedirectAfterLogin();
        sessionStorage.removeItem(BUYER_LOGIN_REDIRECT_KEY);
        router.replace(destination);
      } catch {
        if (cancelled) return;
        exchangedAccessTokenRef.current = '';
        setError('Gagal menyelesaikan login. Silakan periksa koneksi lalu coba lagi.');
        setLoading(false);
      }
    }

    // OAuth redirects are processed asynchronously by the Supabase client.
    // Listen for the completed session so a slow callback cannot be missed.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) return;
      const timer = window.setTimeout(() => {
        pendingTimers.delete(timer);
        void exchangeVerifiedSession(session);
      }, 0);
      pendingTimers.add(timer);
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError) {
        setError(`Gagal membaca sesi login: ${sessionError.message}`);
        return;
      }
      if (data.session) void exchangeVerifiedSession(data.session);
    });

    return () => {
      cancelled = true;
      exchangedAccessTokenRef.current = '';
      authListener.subscription.unsubscribe();
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [router, searchParams]);

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');

    try {
      const callbackUrl = new URL('/buyer/login', window.location.origin);
      callbackUrl.searchParams.set('redirect', redirect);
      sessionStorage.setItem(BUYER_LOGIN_REDIRECT_KEY, redirect);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl.toString() },
      });

      if (oauthError) {
        sessionStorage.removeItem(BUYER_LOGIN_REDIRECT_KEY);
        setError(`Login Google gagal: ${oauthError.message}`);
        setLoading(false);
      }
    } catch {
      sessionStorage.removeItem(BUYER_LOGIN_REDIRECT_KEY);
      setError('Tidak dapat membuka login Google. Silakan coba lagi.');
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/buyer/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('login_error'));
        setLoading(false);
        return;
      }

      setError(data.message || 'Link masuk telah dikirim. Cek inbox email Anda.');
      setLoading(false);
    } catch {
      setError(t('login_error_generic'));
      setLoading(false);
    }
  }

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!verifiedAccessToken) return;
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/buyer/auth/complete-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${verifiedAccessToken}`,
        },
        body: JSON.stringify({ name: profileName, phone: profilePhone }),
      });
      const data = await response.json();
      if (!response.ok || !data.token) {
        setError(data.error || 'Gagal menyimpan profil buyer.');
        setLoading(false);
        return;
      }

      localStorage.setItem('buyer_token', data.token);
      localStorage.setItem('buyer_session', JSON.stringify(data.buyer));
      const storedRedirect = sessionStorage.getItem(BUYER_LOGIN_REDIRECT_KEY);
      sessionStorage.removeItem(BUYER_LOGIN_REDIRECT_KEY);
      router.replace(safeInternalRedirect(searchParams.get('redirect') || storedRedirect));
    } catch {
      setError('Terjadi kesalahan jaringan. Silakan coba lagi.');
      setLoading(false);
    }
  }

  return (
    <div className="public-layout">
      <header className="public-header">
        <Link href="/" className="brand">✦ pastipremium.my.id</Link>
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

          {profileRequired ? (
            <form onSubmit={handleCompleteProfile}>
              <div className="form-group">
                <label className="form-label">Email terverifikasi</label>
                <input className="form-input" type="email" value={email} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">Nama lengkap</label>
                <input
                  className="form-input"
                  type="text"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="Nama lengkap"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nomor WhatsApp</label>
                <input
                  className="form-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={profilePhone}
                  onChange={e => setProfilePhone(e.target.value)}
                  placeholder="Contoh: 0812... atau +6012..."
                  required
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Nomor luar Indonesia wajib memakai kode negara. Nomor ini digunakan admin untuk menghubungi Anda terkait pesanan.
                </p>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? <span className="loading-spinner" /> : 'Simpan profil & lanjutkan'}
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-lg"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  gap: '10px',
                  background: '#fff',
                  color: '#1f2937',
                  border: '1px solid #d1d5db',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
                }}
                disabled={loading}
                onClick={() => void handleGoogleLogin()}
              >
                {loading ? <span className="loading-spinner" /> : <FcGoogle style={{ fontSize: '1.35rem' }} />}
                <span>Lanjutkan dengan Google</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '22px 0' }}>
                <div style={{ height: '1px', flex: 1, background: 'var(--border-primary)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>atau lewat email</span>
                <div style={{ height: '1px', flex: 1, background: 'var(--border-primary)' }} />
              </div>

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">Email pembelian</label>
                  <input
                    className="form-input"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@contoh.com"
                    required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Kami akan mengirim link masuk aman ke email ini.
                  </p>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={loading}
                >
                  {loading ? <span className="loading-spinner" /> : 'Kirim link masuk'}
                </button>
              </form>
            </>
          )}

          <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {t('login_safe')}
          </div>
        </div>
      </div>
    </div>
  );
}
