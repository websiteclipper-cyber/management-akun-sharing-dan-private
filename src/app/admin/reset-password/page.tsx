'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FiEye, FiEyeOff } from 'react-icons/fi';

export default function AdminResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<div className="admin-auth-page"><div className="loading-spinner" /></div>}>
      <AdminResetPasswordPage />
    </Suspense>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={visible ? 'text' : 'password'}
          className="form-input"
          value={value}
          onChange={event => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={12}
          maxLength={128}
          style={{ paddingRight: '46px' }}
          required
        />
        <button
          type="button"
          onClick={() => setVisible(current => !current)}
          aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'}
          title={visible ? 'Sembunyikan password' : 'Tampilkan password'}
          style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', padding: '4px', fontSize: '1.1rem',
          }}
        >
          {visible ? <FiEyeOff /> : <FiEye />}
        </button>
      </div>
    </div>
  );
}

function AdminResetPasswordPage() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');

    if (!token) {
      setMessage('Link reset tidak valid atau tidak lengkap.');
      return;
    }
    if (password !== confirmation) {
      setMessage('Konfirmasi password tidak sama.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || 'Gagal memperbarui password.');
        return;
      }
      setSuccess(true);
      setMessage('Password berhasil diperbarui. Silakan login dengan password baru.');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_session');
      window.history.replaceState({}, '', '/admin/reset-password');
    } catch {
      setMessage('Gagal memperbarui password. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-auth-page">
      <div className="admin-auth-card">
        <h1>Buat Password Baru</h1>
        <p className="admin-auth-subtitle">Minimal 12 karakter, dengan huruf besar, huruf kecil, dan angka.</p>

        {message && <div className="admin-auth-message">{message}</div>}

        {!success && (
          <form onSubmit={handleSubmit}>
            <PasswordInput label="Password baru" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordInput label="Ulangi password baru" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading || !token}
            >
              {loading ? <span className="loading-spinner" /> : 'Simpan password baru'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Link href="/admin/login" style={{ fontSize: '0.85rem' }}>Kembali ke login</Link>
        </div>
      </div>
    </div>
  );
}
