'use client';

import { useState, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertCircle, FiCheckCircle, FiCopy, FiArrowLeft, FiEye, FiEyeOff, FiShield, FiFileText } from 'react-icons/fi';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function WarrantyClaimPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ background: '#000' }}>
        <div className="loading-spinner"></div>
      </div>
    }>
      <div style={{ 
        minHeight: '100vh', 
        background: '#000', 
        color: '#ededed',
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Subtle top gradient line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)'
        }} />

        {/* Ambient background glow */}
        <div style={{
          position: 'absolute',
          top: '-20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '400px',
          background: 'radial-gradient(ellipse at top, rgba(59,130,246,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <header style={{ position: 'relative', zIndex: 10, padding: '32px 40px', display: 'flex', alignItems: 'center' }}>
          <Link href="/" style={{ 
            display: 'inline-flex', alignItems: 'center', gap: '8px', 
            color: '#888', textDecoration: 'none', transition: 'color 0.2s', 
            fontSize: '0.9rem', fontWeight: 500 
          }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#ededed'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#888'}
          >
            <FiArrowLeft /> <span>Kembali</span>
          </Link>
        </header>

        <main style={{ 
          position: 'relative', zIndex: 10, flex: 1, display: 'flex', 
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
          padding: '20px 24px 80px' 
        }}>
          <WarrantyForm />
        </main>
      </div>
    </Suspense>
  );
}

function WarrantyForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    order_number: searchParams.get('order') || searchParams.get('order_number') || '',
    reported_email: '',
    reported_password: '',
    issue_type: 'password_changed',
    issue_description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/warranty/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Terjadi kesalahan sistem');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('Gagal menghubungi server. Periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: '#0a0a0a',
    border: '1px solid #333',
    borderRadius: '8px',
    color: '#ededed',
    fontSize: '0.95rem',
    transition: 'all 0.2s ease',
    outline: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  };

  const labelStyle = {
    display: 'block', 
    fontSize: '0.85rem', 
    fontWeight: 500, 
    color: '#888', 
    marginBottom: '8px'
  };

  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#666';
    e.currentTarget.style.background = '#111';
  };

  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#333';
    e.currentTarget.style.background = '#0a0a0a';
  };

  return (
    <div style={{ width: '100%', maxWidth: '440px' }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          background: '#000',
          border: '1px solid #222',
          borderRadius: '16px',
          padding: '40px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.02)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ 
            width: '48px', height: '48px', margin: '0 auto 20px',
            background: '#111', border: '1px solid #333',
            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <FiShield style={{ fontSize: '20px', color: '#fff' }} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 8px', color: '#fff', letterSpacing: '-0.02em' }}>
            Klaim Garansi
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#888', margin: 0, lineHeight: 1.5 }}>
            Masukkan ID pesanan dan detail kendala untuk meminta peninjauan admin.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {result ? (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              {result.status === 'auto_replaced' ? (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #222' }}>
                    <FiCheckCircle style={{ color: '#22c55e', fontSize: '24px' }} />
                    <div>
                      <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 2px' }}>Penggantian Berhasil</h3>
                      <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>ID: {result.claim_code}</p>
                    </div>
                  </div>
                  
                  <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Baru</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: '1rem' }}>{result.new_email}</span>
                        <button onClick={() => handleCopy(result.new_email, 'email')} style={{ background: 'none', border: 'none', color: copied === 'email' ? '#22c55e' : '#666', cursor: 'pointer' }}>
                          {copied === 'email' ? <FiCheckCircle /> : <FiCopy />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password Baru</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <span style={{ color: '#fff', fontFamily: 'monospace', fontSize: '1rem' }}>{result.new_password || '---'}</span>
                        {result.new_password && (
                          <button onClick={() => handleCopy(result.new_password, 'password')} style={{ background: 'none', border: 'none', color: copied === 'password' ? '#22c55e' : '#666', cursor: 'pointer' }}>
                            {copied === 'password' ? <FiCheckCircle /> : <FiCopy />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : ['pending', 'manual_review', 'no_backup'].includes(result.status) ? (
                <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                  <FiAlertCircle style={{ color: '#eab308', fontSize: '32px', margin: '0 auto 16px' }} />
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 8px' }}>Menunggu Peninjauan Admin</h3>
                  <p style={{ fontSize: '0.9rem', color: '#888', margin: '0 0 10px', lineHeight: 1.5 }}>{result.resolution_notes}</p>
                  <p style={{ fontSize: '0.82rem', color: '#666', margin: '0 0 16px', lineHeight: 1.5 }}>
                    Pengajuan belum otomatis diterima. Admin akan memeriksa ID pesanan dan memutuskan klaim diterima atau ditolak.
                  </p>
                  <div style={{ background: '#0a0a0a', border: '1px solid #222', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#aaa' }}>
                    ID Klaim: <strong style={{ color: '#fff' }}>{result.claim_code}</strong>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                  <FiAlertCircle style={{ color: '#ef4444', fontSize: '32px', margin: '0 auto 16px' }} />
                  <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: '0 0 8px' }}>Klaim Ditolak</h3>
                  <p style={{ fontSize: '0.9rem', color: '#888', margin: '0', lineHeight: 1.5 }}>
                    {result.resolution_notes || 'Data kredensial tidak cocok. Pastikan password sesuai dengan data pembelian.'}
                  </p>
                </div>
              )}

              <button 
                onClick={() => {
                  setResult(null);
                  setShowPassword(false);
                  setFormData({ ...formData, reported_password: '' });
                }}
                style={{ 
                  width: '100%', padding: '12px', borderRadius: '8px',
                  background: '#111', color: '#ededed',
                  border: '1px solid #333', fontSize: '0.95rem', fontWeight: 500,
                  cursor: 'pointer', transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#222'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#111'}
              >
                Kembali
              </button>
            </motion.div>
          ) : (
            <motion.form 
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleSubmit}
            >
              {error && (
                <div style={{ 
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', 
                  padding: '12px 16px', borderRadius: '8px', 
                  color: '#ef4444', fontSize: '0.85rem', 
                  display: 'flex', gap: '8px', marginBottom: '24px'
                }}>
                  <FiAlertCircle style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <FiFileText style={{ color: '#60a5fa', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <strong style={{ display: 'block', color: '#f5f5f5', fontSize: '0.86rem', marginBottom: '4px' }}>
                      Harap baca ketentuan sebelum mengajukan klaim
                    </strong>
                    <span style={{ color: '#999', fontSize: '0.8rem', lineHeight: 1.5 }}>
                      Ketentuan garansi sama seperti yang berlaku sebelum membeli. Pastikan kendala Anda memenuhi syarat sebelum mengirim pengajuan.
                    </span>
                  </div>
                </div>
                <Link
                  href="/ketentuan"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    alignSelf: 'flex-start',
                    padding: '9px 16px', borderRadius: '8px',
                    background: '#111', color: '#ededed',
                    border: '1px solid #333', fontSize: '0.85rem', fontWeight: 600,
                    textDecoration: 'none', transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; e.currentTarget.style.borderColor = '#555'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#111'; e.currentTarget.style.borderColor = '#333'; }}
                >
                  <FiFileText /> Baca Ketentuan
                </Link>
              </div>

              <div style={{
                background: 'rgba(234,179,8,0.08)',
                border: '1px solid rgba(234,179,8,0.22)',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '24px',
                display: 'flex',
                gap: '10px'
              }}>
                <FiAlertCircle style={{ color: '#eab308', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <strong style={{ display: 'block', color: '#f5f5f5', fontSize: '0.86rem', marginBottom: '4px' }}>
                    Klaim akan ditinjau secara manual
                  </strong>
                  <span style={{ color: '#999', fontSize: '0.8rem', lineHeight: 1.5 }}>
                    Admin akan memeriksa ID pesanan dan data pengajuan sesuai ketentuan yang berlaku, lalu memutuskan klaim diterima atau ditolak.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={labelStyle}>ID Pesanan</label>
                  <input
                    type="text" required placeholder="Contoh: ORD-XXXXX"
                    style={inputStyle} value={formData.order_number}
                    onChange={e => setFormData({...formData, order_number: e.target.value})}
                    onFocus={focusStyle} onBlur={blurStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Email / Username Akun</label>
                  <input
                    type="text" required placeholder="email@akun.com"
                    style={inputStyle} value={formData.reported_email}
                    onChange={e => setFormData({...formData, reported_email: e.target.value})}
                    onFocus={focusStyle} onBlur={blurStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Password Asli</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Masukkan password akun"
                      style={{ ...inputStyle, paddingRight: '48px' }}
                      value={formData.reported_password}
                      onChange={e => setFormData({ ...formData, reported_password: e.target.value })}
                      onFocus={focusStyle}
                      onBlur={blurStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        right: '12px',
                        transform: 'translateY(-50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        padding: 0,
                        background: 'transparent',
                        border: 'none',
                        color: '#888',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#888'; }}
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Jenis Kendala</label>
                  <select
                    style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M6 8.825L1.175 4 2.238 2.938 6 6.7 9.763 2.937 10.825 4z' fill='%23666'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center' }}
                    value={formData.issue_type}
                    onChange={e => setFormData({...formData, issue_type: e.target.value})}
                    onFocus={focusStyle} onBlur={blurStyle}
                  >
                    <option value="password_changed">Password Salah / Diubah</option>
                    <option value="screen_limit">Limit Screen (Terlalu Banyak Layar)</option>
                    <option value="suspended">Akun Suspended / Hold</option>
                    <option value="other">Kendala Lainnya</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Keterangan (Opsional)</label>
                  <textarea
                    placeholder="Detail kendala..."
                    style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                    value={formData.issue_description}
                    onChange={e => setFormData({...formData, issue_description: e.target.value})}
                    onFocus={focusStyle} onBlur={blurStyle}
                  />
                </div>
              </div>

              <button
                type="submit" disabled={loading}
                style={{ 
                  width: '100%', padding: '12px', borderRadius: '8px', marginTop: '32px',
                  background: loading ? '#333' : '#ededed', 
                  color: loading ? '#888' : '#000', 
                  border: 'none', fontSize: '0.95rem', fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                onMouseEnter={(e) => { if(!loading) e.currentTarget.style.background = '#fff'; }}
                onMouseLeave={(e) => { if(!loading) e.currentTarget.style.background = '#ededed'; }}
              >
                {loading ? 'Mengirim Pengajuan...' : 'Kirim untuk Peninjauan Admin'}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

