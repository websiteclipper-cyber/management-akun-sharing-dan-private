'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FiActivity,
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiClipboard,
  FiDollarSign,
  FiGift,
  FiLink,
  FiMessageCircle,
  FiSend,
  FiUserPlus,
} from 'react-icons/fi';

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

  const [refCodeStatus, setRefCodeStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [refCheckTimeout, setRefCheckTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

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

    if (form.ref_code.length < 3) {
      setError('Custom web referral minimal 3 karakter');
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

  if (success && resultData) {
    const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const referralLink = `${siteUrl}/?ref=${resultData.ref_code}`;

    function copyReferralLink() {
      navigator.clipboard.writeText(referralLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }

    function shareWhatsApp() {
      const text = `Halo! Cek akun premium dengan harga terjangkau di sini:\n${referralLink}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }

    return (
      <div className="reseller-register-page">
        <section className="register-card success-card" aria-labelledby="register-success-title">
          <div className="success-mark" aria-hidden="true">
            <FiCheck />
          </div>

          <h1 id="register-success-title" className="register-title">Pendaftaran Berhasil</h1>
          <p className="register-subtitle">
            Akun mitra Anda langsung aktif dan siap digunakan.
          </p>

          <div className="result-panel">
            <div>
              <span>Nama</span>
              <strong>{resultData.name}</strong>
            </div>
            <div>
              <span>Kode Referral Anda</span>
              <strong className="ref-code">{resultData.ref_code}</strong>
            </div>
          </div>

          <div className="referral-panel">
            <div className="panel-label">
              <FiLink />
              Link Referral Anda
            </div>
            <code>{referralLink}</code>
            <div className="action-grid">
              <button
                type="button"
                onClick={copyReferralLink}
                className={`btn btn-secondary action-button ${linkCopied ? 'copied' : ''}`}
              >
                {linkCopied ? <FiCheck /> : <FiClipboard />}
                {linkCopied ? 'Tersalin' : 'Copy Link'}
              </button>
              <button type="button" onClick={shareWhatsApp} className="btn action-button whatsapp-button">
                <FiMessageCircle />
                Share WA
              </button>
            </div>
          </div>

          <div className="notice-panel success-notice">
            <FiCheck />
            <div>
              <strong>Akun langsung aktif</strong>
              <p>Login, bagikan link referral, dan mulai pantau komisi dari dashboard mitra.</p>
            </div>
          </div>

          <div className="steps-panel">
            <div className="panel-label">
              <FiGift />
              Cara Mendapatkan Komisi
            </div>
            {[
              'Bagikan link referral Anda ke teman, grup, atau sosial media.',
              'Saat ada pembelian lewat link Anda, komisi otomatis tercatat.',
              'Pantau komisi di dashboard dan ajukan pencairan sesuai ketentuan.',
            ].map((text, index) => (
              <div className="step-row" key={text}>
                <span>{index + 1}</span>
                <p>{text}</p>
              </div>
            ))}
          </div>

          <Link href="/reseller/login" className="btn btn-primary btn-lg register-submit">
            <FiSend />
            Login Sekarang
          </Link>
        </section>

        <RegisterStyles />
      </div>
    );
  }

  return (
    <div className="reseller-register-page">
      <section className="register-card" aria-labelledby="register-title">
        <div className="register-mark" aria-hidden="true">
          <FiUserPlus />
        </div>

        <h1 id="register-title" className="register-title">Daftar Jadi Mitra</h1>
        <p className="register-subtitle">
          Bergabung sekarang dan dapatkan komisi dari setiap penjualan.
        </p>

        <div className="benefit-grid" aria-label="Keuntungan mitra">
          {[
            { icon: <FiDollarSign />, text: 'Komisi per sale' },
            { icon: <FiLink />, text: 'Link referral unik' },
            { icon: <FiActivity />, text: 'Dashboard realtime' },
            { icon: <FiGift />, text: 'Gratis selamanya' },
          ].map((benefit) => (
            <div key={benefit.text} className="benefit-item">
              {benefit.icon}
              <span>{benefit.text}</span>
            </div>
          ))}
        </div>

        {error && <div className="register-error">{error}</div>}

        <form className="register-form" onSubmit={handleRegister}>
          <div className="form-group">
            <label className="form-label">Nama Lengkap</label>
            <input
              className="form-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Nama Anda"
              required
              maxLength={50}
              autoComplete="name"
            />
          </div>

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
              autoComplete="tel"
            />
            <p className="field-help">Untuk komunikasi terkait akun mitra Anda.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Custom Web Referral Kamu</label>
            <input
              className="form-input referral-input"
              value={form.ref_code}
              onChange={e => handleRefCodeChange(e.target.value)}
              placeholder="Contoh: TOKOANDI"
              required
              maxLength={20}
              autoComplete="username"
              data-status={refCodeStatus}
            />
            <div className="ref-status-row">
              <p>
                Pilih nama unik untuk link web reseller kamu. Contoh: pastipremium.my.id/?ref=TOKOANDI
              </p>
              {refCodeStatus === 'checking' && <span className="muted">Mengecek...</span>}
              {refCodeStatus === 'available' && <span className="available">Tersedia</span>}
              {refCodeStatus === 'taken' && <span className="taken">Sudah dipakai</span>}
            </div>
          </div>

          <div className="pin-grid">
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
                autoComplete="new-password"
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
                autoComplete="new-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg register-submit"
            disabled={loading || refCodeStatus === 'taken'}
          >
            {loading ? <span className="loading-spinner" /> : <FiUserPlus />}
            {loading ? 'Memproses...' : 'Daftar Sebagai Mitra'}
          </button>
        </form>

        <div className="register-links">
          <Link href="/reseller/login" className="primary-link">
            Sudah punya akun? Login <FiArrowRight />
          </Link>
          <Link href="/" className="back-link">
            <FiArrowLeft /> Kembali ke Beranda
          </Link>
        </div>
      </section>

      <RegisterStyles />
    </div>
  );
}

function RegisterStyles() {
  return (
    <style jsx global>{`
      .reseller-register-page {
        min-height: 100vh;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 32px 18px;
        background:
          linear-gradient(180deg, rgba(37, 99, 235, 0.07), rgba(37, 99, 235, 0) 34%),
          var(--bg-base);
      }

      .register-card {
        width: min(100%, 480px);
        margin: 0 auto;
        background: var(--bg-card);
        border: 1px solid var(--border-primary);
        border-radius: var(--radius-2xl);
        box-shadow: var(--shadow-lg);
        padding: 34px 32px 30px;
      }

      .success-card {
        max-width: 500px;
      }

      .register-mark,
      .success-mark {
        width: 64px;
        height: 64px;
        margin: 0 auto 18px;
        border-radius: 18px;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        box-shadow: 0 18px 38px rgba(124, 58, 237, 0.22);
      }

      .register-mark {
        background: linear-gradient(135deg, #2563eb, #7c3aed);
      }

      .success-mark {
        background: linear-gradient(135deg, #16a34a, #059669);
        box-shadow: 0 18px 38px rgba(22, 163, 74, 0.22);
      }

      .register-title {
        margin: 0 0 8px;
        color: var(--text-primary);
        font-size: 2rem;
        line-height: 1.12;
        font-weight: 800;
        text-align: center;
      }

      .register-subtitle {
        max-width: 350px;
        margin: 0 auto 24px;
        color: var(--text-secondary);
        font-size: 0.98rem;
        line-height: 1.55;
        text-align: center;
      }

      .benefit-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 24px;
      }

      .benefit-item {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 11px 12px;
        border: 1px solid var(--border-secondary);
        border-radius: 12px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 0.8rem;
        font-weight: 600;
        line-height: 1.25;
      }

      .benefit-item svg {
        flex: 0 0 auto;
        color: var(--accent);
        font-size: 1rem;
      }

      .register-error {
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

      .register-form :global(.form-group) {
        margin-bottom: 18px;
      }

      .register-form :global(.form-label) {
        color: var(--text-secondary);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .register-form :global(.form-input) {
        min-height: 50px;
        border-radius: 12px;
        background: #ffffff;
        font-size: 0.95rem;
      }

      .referral-input {
        text-transform: uppercase;
        letter-spacing: 2px;
        font-weight: 700;
      }

      .referral-input[data-status='available'] {
        border-color: #16a34a;
        box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.1);
      }

      .referral-input[data-status='taken'] {
        border-color: #dc2626;
        box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.1);
      }

      .field-help,
      .ref-status-row p {
        margin: 8px 0 0;
        color: var(--text-muted);
        font-size: 0.78rem;
        line-height: 1.45;
      }

      .ref-status-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }

      .ref-status-row p {
        margin-top: 8px;
      }

      .ref-status-row span {
        flex: 0 0 auto;
        margin-top: 8px;
        font-size: 0.78rem;
        font-weight: 700;
      }

      .ref-status-row .muted {
        color: var(--text-muted);
      }

      .ref-status-row .available {
        color: #16a34a;
      }

      .ref-status-row .taken {
        color: #dc2626;
      }

      .pin-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .register-submit {
        width: 100%;
        min-height: 54px;
        justify-content: center;
        border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        color: #ffffff;
        box-shadow: 0 18px 34px rgba(37, 99, 235, 0.22);
      }

      .register-links {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        margin-top: 24px;
        text-align: center;
      }

      .register-links a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: var(--text-muted);
        font-size: 0.86rem;
        font-weight: 500;
      }

      .register-links .primary-link {
        color: var(--accent);
        font-weight: 700;
      }

      .register-links .back-link {
        font-size: 0.8rem;
      }

      .result-panel,
      .referral-panel,
      .notice-panel,
      .steps-panel {
        border: 1px solid var(--border-secondary);
        border-radius: 14px;
        background: var(--bg-secondary);
        padding: 16px;
        margin-bottom: 16px;
      }

      .result-panel {
        display: grid;
        gap: 14px;
      }

      .result-panel span,
      .panel-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-muted);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }

      .result-panel strong {
        display: block;
        color: var(--text-primary);
        font-size: 1rem;
      }

      .result-panel .ref-code {
        color: var(--accent);
        font-size: 1.28rem;
        letter-spacing: 0.16em;
      }

      .referral-panel code {
        display: block;
        color: #166534;
        background: #ffffff;
        border: 1px solid rgba(22, 163, 74, 0.16);
        border-radius: 10px;
        padding: 11px 12px;
        margin-bottom: 12px;
        font-family: inherit;
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.5;
        word-break: break-all;
      }

      .action-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .action-button {
        width: 100%;
        min-width: 0;
        padding-inline: 12px;
      }

      .action-button.copied {
        background: #16a34a;
        border-color: #16a34a;
        color: #ffffff;
      }

      .whatsapp-button {
        background: #16a34a;
        border: 1px solid #16a34a;
        color: #ffffff;
      }

      .notice-panel {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }

      .notice-panel > svg {
        flex: 0 0 auto;
        color: #16a34a;
        font-size: 1.2rem;
        margin-top: 2px;
      }

      .notice-panel strong {
        display: block;
        color: #166534;
        font-size: 0.9rem;
        margin-bottom: 2px;
      }

      .notice-panel p,
      .step-row p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.82rem;
        line-height: 1.5;
      }

      .step-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        margin-top: 10px;
      }

      .step-row span {
        flex: 0 0 22px;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--accent);
        background: var(--accent-soft);
        font-size: 0.72rem;
        font-weight: 800;
      }

      @media (min-width: 900px) {
        .reseller-register-page {
          align-items: center;
          padding: 56px 24px;
        }

        .register-card {
          padding: 38px;
        }
      }

      @media (max-width: 520px) {
        .reseller-register-page {
          padding: 22px 16px 28px;
        }

        .register-card {
          border-radius: 18px;
          padding: 26px 20px;
        }

        .register-mark,
        .success-mark {
          width: 58px;
          height: 58px;
          border-radius: 16px;
          font-size: 1.55rem;
        }

        .register-title {
          font-size: 1.8rem;
        }

        .register-subtitle {
          margin-bottom: 22px;
          font-size: 0.94rem;
        }

        .benefit-grid,
        .pin-grid,
        .action-grid {
          grid-template-columns: 1fr;
        }

        .ref-status-row {
          flex-direction: column;
          gap: 2px;
        }

        .ref-status-row span {
          margin-top: 0;
        }
      }
    `}</style>
  );
}
