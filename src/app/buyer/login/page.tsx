'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/lib/locale-context';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { FcGoogle } from 'react-icons/fc';

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

  useEffect(() => {
    async function exchangeVerifiedSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      setLoading(true);
      const response = await fetch('/api/buyer/auth/exchange', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await response.json();
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
        setError(data.error || 'Gagal memverifikasi akun buyer.');
        setLoading(false);
        return;
      }
      localStorage.setItem('buyer_token', data.token);
      localStorage.setItem('buyer_session', JSON.stringify(data.buyer));
      router.replace(redirect);
    }
    void exchangeVerifiedSession();
  }, [redirect, router]);

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');

    try {
      const callbackUrl = new URL('/buyer/login', window.location.origin);
      callbackUrl.searchParams.set('redirect', redirect);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl.toString() },
      });

      if (oauthError) {
        setError(`Login Google gagal: ${oauthError.message}`);
        setLoading(false);
      }
    } catch {
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
      router.replace(redirect);
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
