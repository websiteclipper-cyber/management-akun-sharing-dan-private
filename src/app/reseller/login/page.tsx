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

    try {
      const res = await fetch('/api/reseller/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_code: form.ref_code.trim(), pin: form.pin.trim() }),
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
    } catch {
      setError('Terjadi kesalahan. Silakan coba lagi.');
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '1.8rem'
          }}>
            🤝
          </div>
        </div>
        <h1>Portal Mitra</h1>
        <div className="subtitle">
          Masuk untuk melihat performa penjualan & komisi Anda.
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Kode Referral</label>
            <input
              className="form-input"
              value={form.ref_code}
              onChange={e => setForm({ ...form, ref_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              placeholder="Contoh: ANDI"
              required
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
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Default PIN adalah 123456 atau 6 digit terakhir nomor WhatsApp Anda.
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none' }}
            disabled={loading}
          >
            {loading ? <span className="loading-spinner" /> : '🚀 Masuk ke Portal Mitra'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link href="/reseller/register" style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}>
            Belum punya akun? Daftar sekarang →
          </Link>
          <Link href="/" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
