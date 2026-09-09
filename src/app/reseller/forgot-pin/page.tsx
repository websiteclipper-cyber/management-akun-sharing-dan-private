'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FiArrowLeft, FiCheck, FiKey, FiShield } from 'react-icons/fi';
import styles from '../reseller-flow.module.css';

export default function ForgotPinPage() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ ref_code: '', phone: '' });
  const [error, setError] = useState('');
  const [newPin, setNewPin] = useState('');

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNewPin('');

    try {
      const res = await fetch('/api/reseller/auth/forgot-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_code: form.ref_code.trim(), phone: form.phone.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Gagal mereset PIN');
        setLoading(false);
        return;
      }

      setNewPin(data.new_pin);
    } catch {
      setError('Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.authPage}>
      <Link href="/" className={styles.authBrand}><span>PP</span> PastiPremium</Link>
      <div className={styles.authCard}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '1.8rem', color: 'white'
          }}>
            <FiKey aria-hidden="true" />
          </div>
        </div>
        <h1>Lupa PIN Mitra</h1>
        <div className="subtitle" style={{ marginBottom: '24px' }}>
          Masukkan Kode Referral dan No. WhatsApp Anda untuk mendapatkan PIN baru.
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        <div className={styles.error} role="status">
          Reset PIN mandiri sementara dinonaktifkan. Hubungi admin agar identitas mitra dapat diverifikasi sebelum PIN diganti.
        </div>

        {newPin ? (
          <div className={styles.pinResult} style={{
            background: 'var(--success-bg, #ecfdf5)', 
            border: '1px solid var(--success-border, #a7f3d0)', 
            padding: '24px', 
            borderRadius: '12px', 
            textAlign: 'center',
            marginBottom: '24px'
          }}>
            <h3 style={{ color: 'var(--success-text, #065f46)', marginBottom: '12px', fontSize: '1.1rem' }}>
              <FiCheck aria-hidden="true" /> Reset PIN Berhasil!
            </h3>
            <p style={{ marginBottom: '16px', fontSize: '0.9rem', color: 'var(--text)' }}>
              Ini adalah PIN baru Anda. <strong style={{ color: 'red' }}>Catat dan simpan baik-baik!</strong> PIN ini hanya ditampilkan satu kali.
            </p>
            <div style={{ 
              fontSize: '2.5rem', 
              fontWeight: '900', 
              letterSpacing: '8px', 
              color: '#111', 
              background: '#fff', 
              padding: '16px', 
              borderRadius: '8px',
              border: '2px dashed #ccc',
              fontFamily: 'monospace'
            }}>
              {newPin}
            </div>
            
            <Link href="/reseller/login" className={`btn btn-primary btn-lg ${styles.fullButton}`} style={{ width: '100%', marginTop: '24px' }}>
              Kembali ke Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label" htmlFor="forgot-ref-code">Kode Referral</label>
              <input
                id="forgot-ref-code"
                className="form-input"
                value={form.ref_code}
                onChange={e => setForm({ ...form, ref_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                placeholder="Contoh: ANDI"
                required
                style={{ textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="forgot-phone">No. WhatsApp</label>
              <input
                id="forgot-phone"
                type="tel"
                className="form-input"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^0-9]/g, '') })}
                placeholder="0812xxxxxx"
                required
              />
            </div>

            <button
              type="submit"
              className={`btn btn-primary btn-lg ${styles.fullButton}`}
              style={{ width: '100%', justifyContent: 'center', border: 'none' }}
              disabled
            >
              {loading ? <span className="loading-spinner" /> : 'Minta PIN Baru'}
            </button>
          </form>
        )}

        {!newPin && (
          <div className={styles.authLinks} style={{ textAlign: 'center', marginTop: '24px' }}>
            <Link href="/reseller/login" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <FiArrowLeft aria-hidden="true" /> Kembali ke Login
            </Link>
          </div>
        )}
        <div className={styles.secureNote}><FiShield aria-hidden="true" /> Verifikasi menggunakan data mitra terdaftar</div>
      </div>
    </div>
  );
}
