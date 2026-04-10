'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ResellerRegisterPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resultData, setResultData] = useState<{ name: string; ref_code: string } | null>(null);
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    ref_code: '',
    pin: '',
    pin_confirm: '',
  });

  // Real-time ref_code availability check
  const [refCodeStatus, setRefCodeStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [refCheckTimeout, setRefCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  function handleRefCodeChange(value: string) {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setForm(prev => ({ ...prev, ref_code: clean }));
    setRefCodeStatus('idle');

    if (refCheckTimeout) clearTimeout(refCheckTimeout);

    if (clean.length >= 3) {
      setRefCodeStatus('checking');
      const timeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/reseller/auth/check-code?code=${clean}`);
          const data = await res.json();
          setRefCodeStatus(data.available ? 'available' : 'taken');
        } catch {
          setRefCodeStatus('idle');
        }
      }, 500);
      setRefCheckTimeout(timeout);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Client-side validations
    if (form.ref_code.length < 3) {
      setError('Kode referral minimal 3 karakter');
      return;
    }
    if (form.pin.length < 4) {
      setError('PIN minimal 4 karakter');
      return;
    }
    if (form.pin !== form.pin_confirm) {
      setError('Konfirmasi PIN tidak cocok');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/reseller/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          ref_code: form.ref_code.trim(),
          pin: form.pin,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Pendaftaran gagal');
        setLoading(false);
        return;
      }

      setResultData(data.reseller);
      setSuccess(true);
    } catch {
      setError('Terjadi kesalahan koneksi. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (success && resultData) {
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const referralLink = `${siteUrl}/?ref=${resultData.ref_code}`;


    function copyReferralLink() {
      navigator.clipboard.writeText(referralLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }

    function shareWhatsApp() {
      const text = `Halo! Cek akun premium dengan harga terjangkau di sini 👇\n${referralLink}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }

    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: '480px' }}>
          <div style={{ textAlign: 'center' }}>
            {/* Success animation circle */}
            <div style={{
              width: '80px', height: '80px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: '2.2rem',
              boxShadow: '0 0 40px rgba(34,197,94,0.3)',
              animation: 'fadeInScale 0.5s ease-out'
            }}>
              ✓
            </div>

            <h1 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Pendaftaran Berhasil! 🎉</h1>
            <p className="subtitle" style={{ marginBottom: '24px' }}>
              Akun mitra Anda langsung aktif dan siap digunakan!
            </p>

            {/* Info card */}
            <div style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              textAlign: 'left',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Nama</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{resultData.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Kode Referral Anda</div>
                  <div style={{
                    fontWeight: 800, fontSize: '1.3rem', letterSpacing: '3px',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                  }}>
                    {resultData.ref_code}
                  </div>
                </div>
              </div>
            </div>

            {/* Referral Link - shown immediately */}
            <div style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              marginBottom: '16px',
              textAlign: 'left'
            }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                🔗 Link Referral Anda
              </div>
              <code style={{
                display: 'block',
                fontSize: '0.82rem',
                color: '#22c55e',
                fontWeight: 600,
                wordBreak: 'break-all',
                marginBottom: '12px',
                lineHeight: 1.5
              }}>
                {referralLink}
              </code>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={copyReferralLink}
                  className="btn btn-sm"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    background: linkCopied ? '#22c55e' : 'var(--bg-secondary)',
                    border: linkCopied ? '1px solid #22c55e' : '1px solid var(--border-primary)',
                    color: linkCopied ? '#fff' : 'var(--text-primary)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {linkCopied ? '✅ Tersalin!' : '📋 Copy Link'}
                </button>
                <button
                  onClick={shareWhatsApp}
                  className="btn btn-sm"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    background: '#25D366',
                    border: '1px solid #25D366',
                    color: '#fff',
                  }}
                >
                  📱 Share WA
                </button>
              </div>
            </div>

            {/* Active status notice */}
            <div style={{
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 16px',
              marginBottom: '24px',
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              textAlign: 'left'
            }}>
              <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>✅</span>
              <div>
                <div style={{ fontWeight: 600, color: '#22c55e', fontSize: '0.85rem', marginBottom: '2px' }}>
                  Akun Langsung Aktif!
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Anda bisa langsung login, bagikan link referral, dan mulai dapatkan komisi dari setiap penjualan!
                </div>
              </div>
            </div>

            {/* How commission works note */}
            <div style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left'
            }}>
              <div style={{ fontWeight: 600, color: '#3b82f6', fontSize: '0.85rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                💡 Cara Mendapatkan Komisi
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {[
                  { step: '1', text: 'Bagikan link referral Anda ke teman, grup, atau sosial media.' },
                  { step: '2', text: 'Ketika seseorang membeli produk melalui link Anda, komisi otomatis tercatat.' },
                  { step: '3', text: 'Pantau komisi Anda di dashboard dan cairkan setelah mencapai minimum.' },
                ].map((item) => (
                  <div key={item.step} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.72rem', fontWeight: 700, flexShrink: 0
                    }}>{item.step}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <Link href="/reseller/login">
              <button
                className="btn btn-primary btn-lg"
                style={{
                  width: '100%', justifyContent: 'center',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  border: 'none'
                }}
              >
                🚀 Login Sekarang & Mulai Berjualan
              </button>
            </Link>
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '1.8rem'
          }}>
            🚀
          </div>
        </div>
        <h1>Daftar Jadi Mitra</h1>
        <div className="subtitle">
          Bergabung sekarang dan dapatkan komisi dari setiap penjualan!
        </div>

        {/* Benefits */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
          margin: '16px 0 20px',
        }}>
          {[
            { icon: '💰', text: 'Komisi per sale' },
            { icon: '🔗', text: 'Link referral unik' },
            { icon: '📊', text: 'Dashboard realtime' },
            { icon: '🆓', text: 'Gratis selamanya' },
          ].map((b, i) => (
            <div key={i} style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 12px',
              display: 'flex', alignItems: 'center', gap: '8px',
              fontSize: '0.78rem', color: 'var(--text-secondary)',
            }}>
              <span style={{ fontSize: '1rem' }}>{b.icon}</span>
              {b.text}
            </div>
          ))}
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleRegister}>
          {/* Name */}
          <div className="form-group">
            <label className="form-label">Nama Lengkap</label>
            <input
              className="form-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Nama Anda"
              required
              maxLength={50}
            />
          </div>

          {/* Phone */}
          <div className="form-group">
            <label className="form-label">No. WhatsApp</label>
            <input
              className="form-input"
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="08123456789"
              required
              maxLength={15}
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              Untuk komunikasi terkait akun mitra Anda.
            </p>
          </div>

          {/* Ref Code */}
          <div className="form-group">
            <label className="form-label">Kode Referral (Pilih Sendiri)</label>
            <input
              className="form-input"
              value={form.ref_code}
              onChange={e => handleRefCodeChange(e.target.value)}
              placeholder="Contoh: ANDI"
              required
              maxLength={20}
              style={{
                textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700,
                borderColor: refCodeStatus === 'available' ? '#22c55e'
                  : refCodeStatus === 'taken' ? '#ef4444'
                  : undefined,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                Ini akan jadi link unik Anda. Huruf & angka saja, min. 3 karakter.
              </p>
              {refCodeStatus === 'checking' && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Mengecek...</span>
              )}
              {refCodeStatus === 'available' && (
                <span style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 600 }}>✓ Tersedia</span>
              )}
              {refCodeStatus === 'taken' && (
                <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>✗ Sudah dipakai</span>
              )}
            </div>
          </div>

          {/* PIN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Buat PIN</label>
              <input
                type="password"
                className="form-input"
                value={form.pin}
                onChange={e => setForm({ ...form, pin: e.target.value })}
                placeholder="Min. 4 karakter"
                required
                minLength={4}
                maxLength={20}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Konfirmasi PIN</label>
              <input
                type="password"
                className="form-input"
                value={form.pin_confirm}
                onChange={e => setForm({ ...form, pin_confirm: e.target.value })}
                placeholder="Ulangi PIN"
                required
                minLength={4}
                maxLength={20}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{
              width: '100%', justifyContent: 'center',
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              border: 'none', marginTop: '8px'
            }}
            disabled={loading || refCodeStatus === 'taken'}
          >
            {loading ? <span className="loading-spinner" /> : '🤝 Daftar Sebagai Mitra'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link href="/reseller/login" style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
            Sudah punya akun? Login →
          </Link>
          <Link href="/" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ← Kembali ke Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
