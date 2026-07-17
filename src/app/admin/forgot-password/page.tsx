'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      setMessage(data.message || 'Jika email terdaftar, link reset telah dikirim.');
    } catch {
      setMessage('Permintaan belum dapat diproses. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-auth-page">
      <div className="admin-auth-card">
        <h1>Reset Password Admin</h1>
        <p className="admin-auth-subtitle">Link reset berlaku selama 15 menit.</p>

        {message && <div className="admin-auth-message">{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email admin</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="admin@contoh.com"
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? <span className="loading-spinner" /> : 'Kirim link reset'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link href="/admin/login" style={{ fontSize: '0.85rem' }}>Kembali ke login</Link>
        </div>
      </div>
    </div>
  );
}
