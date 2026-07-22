'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResellerLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ ref_code: '', pin: '' });
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch('/api/reseller/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_code: form.ref_code.trim(), pin: form.pin.trim() }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login gagal');
        setLoading(false);
        return;
      }

      localStorage.setItem('reseller_token', data.token);
      localStorage.setItem('reseller_session', JSON.stringify(data.reseller));
      router.push('/reseller/dashboard');
    } catch (loginError) {
      setError(
        loginError instanceof DOMException && loginError.name === 'AbortError'
          ? 'Login terlalu lama merespons. Silakan coba lagi.'
          : 'Terjadi kesalahan. Silakan coba lagi.',
      );
      setLoading(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return (
    <div className="reseller-login-page">
      <div className="reseller-login-card">
        <div className="login-mark" aria-hidden="true">
          M
        </div>

        <h1 className="login-title">Portal Mitra</h1>
        <p className="login-subtitle">
          Masuk untuk melihat performa penjualan dan komisi Anda.
        </p>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Kode Referral</label>
            <input
              className="form-input"
              value={form.ref_code}
              onChange={e => setForm({ ...form, ref_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              placeholder="Contoh: ANDI"
              required
              autoComplete="username"
              style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">PIN</label>
            <input
              type="password"
              className="form-input"
              value={form.pin}
              onChange={e => setForm({ ...form, pin: e.target.value })}
              placeholder="Masukkan 6 digit PIN"
              required
              autoComplete="current-password"
            />
            <p className="field-help">
              Default PIN adalah 123456 atau 6 digit terakhir nomor WhatsApp Anda.
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg login-submit"
            disabled={loading}
          >
            {loading ? <span className="loading-spinner" /> : 'Masuk ke Portal Mitra'}
          </button>
        </form>

        <div className="login-links">
          <Link href="/reseller/forgot-pin">
            Lupa PIN? Reset di sini
          </Link>
          <Link href="/reseller/register" className="primary-link">
            Belum punya akun? Daftar sekarang
          </Link>
          <Link href="/" className="back-link">
            Kembali ke Beranda
          </Link>
        </div>
      </div>

      <style jsx>{`
        .reseller-login-page {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          background:
            linear-gradient(180deg, rgba(37, 99, 235, 0.07), rgba(37, 99, 235, 0) 34%),
            var(--bg-base);
        }

        .reseller-login-card {
          width: min(100%, 440px);
          background: var(--bg-card);
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-2xl);
          box-shadow: var(--shadow-lg);
          padding: 34px 32px 30px;
        }

        .login-mark {
          width: 64px;
          height: 64px;
          margin: 0 auto 18px;
          border-radius: 18px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.45rem;
          font-weight: 900;
          box-shadow: 0 18px 38px rgba(37, 99, 235, 0.22);
        }

        .login-title {
          margin: 0 0 8px;
          color: var(--text-primary);
          font-size: 2rem;
          line-height: 1.12;
          font-weight: 800;
          text-align: center;
        }

        .login-subtitle {
          max-width: 330px;
          margin: 0 auto 26px;
          color: var(--text-secondary);
          font-size: 0.98rem;
          line-height: 1.55;
          text-align: center;
        }

        .login-form :global(.form-group) {
          margin-bottom: 18px;
        }

        .login-form :global(.form-label) {
          color: var(--text-secondary);
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .login-form :global(.form-input) {
          min-height: 50px;
          border-radius: 12px;
          background: #ffffff;
          font-size: 0.95rem;
        }

        .field-help {
          margin: 8px 0 0;
          color: var(--text-muted);
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .login-submit {
          width: 100%;
          min-height: 54px;
          justify-content: center;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          box-shadow: 0 18px 34px rgba(37, 99, 235, 0.22);
        }

        .login-error {
          margin-bottom: 18px;
          border: 1px solid rgba(220, 38, 38, 0.18);
          border-radius: 12px;
          background: rgba(220, 38, 38, 0.08);
          color: #b91c1c;
          padding: 12px 14px;
          font-size: 0.88rem;
          font-weight: 600;
          line-height: 1.4;
        }

        .login-links {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          margin-top: 24px;
          text-align: center;
        }

        .login-links a {
          color: var(--text-muted);
          font-size: 0.86rem;
          font-weight: 500;
        }

        .login-links .primary-link {
          color: var(--accent);
          font-weight: 700;
        }

        .login-links .back-link {
          font-size: 0.8rem;
        }

        @media (min-width: 900px) {
          .reseller-login-page {
            padding: 56px 24px;
          }

          .reseller-login-card {
            padding: 38px;
          }
        }

        @media (max-width: 480px) {
          .reseller-login-page {
            align-items: flex-start;
            padding: 22px 16px 28px;
          }

          .reseller-login-card {
            border-radius: 18px;
            padding: 26px 20px;
          }

          .login-mark {
            width: 58px;
            height: 58px;
            border-radius: 16px;
            font-size: 1.3rem;
          }

          .login-title {
            font-size: 1.8rem;
          }

          .login-subtitle {
            margin-bottom: 22px;
            font-size: 0.94rem;
          }
        }
      `}</style>
    </div>
  );
}
