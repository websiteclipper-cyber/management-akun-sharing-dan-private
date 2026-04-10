'use client';

import { useState, useEffect } from 'react';

interface Setting {
  key: string;
  value: string;
  label: string;
  updated_at?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (data.settings && data.settings.length > 0) {
        setSettings(data.settings);
      } else {
        // Set defaults if empty
        setSettings([
          { key: 'support_whatsapp', value: '082244046330', label: 'Nomor WhatsApp Support' },
        ]);
      }
    } catch {
      setSettings([
        { key: 'support_whatsapp', value: '082244046330', label: 'Nomor WhatsApp Support' },
      ]);
    }
    setLoading(false);
  }

  function updateSetting(key: string, value: string) {
    setSettings(prev =>
      prev.map(s => s.key === key ? { ...s, value } : s)
    );
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Settings berhasil disimpan!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Error: ' + (data.error || 'Unknown'));
      }
    } catch {
      setMessage('❌ Terjadi kesalahan jaringan');
    }
    setSaving(false);
  }

  const waNumber = settings.find(s => s.key === 'support_whatsapp')?.value || '';

  // Format phone for display
  function formatPhone(phone: string): string {
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) return '+62' + clean.substring(1);
    if (clean.startsWith('62')) return '+' + clean;
    return clean;
  }

  return (
    <div className="admin-content">
      <div className="admin-topbar"><h2>Pengaturan Umum</h2></div>
      <div style={{ padding: '32px', maxWidth: '700px' }}>
        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <>
            {/* WhatsApp Support Section */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'rgba(37,211,102,0.15)', color: '#25D366',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem',
                }}>📱</div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2px' }}>WhatsApp Support</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Nomor ini ditampilkan ke buyer & mitra untuk complaint dan bantuan.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Nomor WhatsApp</label>
                <input
                  className="form-input"
                  value={waNumber}
                  onChange={e => updateSetting('support_whatsapp', e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="08xxxxxxxxxx"
                  maxLength={15}
                  style={{ fontSize: '1.1rem', fontWeight: 600, letterSpacing: '1px' }}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Format: 08xxxxxxxxxx. Akan otomatis dikonversi ke format internasional ({formatPhone(waNumber)}).
                </p>
              </div>

              {/* Preview */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginTop: '16px',
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  👁️ Preview — Tampilan di Website
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: '#25D366', color: '#fff', padding: '10px 20px',
                    borderRadius: '999px', fontWeight: 600, fontSize: '0.85rem',
                  }}>
                    💬 Chat WhatsApp Admin
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    background: 'rgba(37,211,102,0.1)', color: '#25D366', padding: '10px 20px',
                    borderRadius: '999px', fontWeight: 600, fontSize: '0.85rem',
                    border: '1px solid rgba(37,211,102,0.3)',
                  }}>
                    📞 {formatPhone(waNumber)}
                  </div>
                </div>
              </div>
            </div>

            {/* Info box */}
            <div style={{
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              marginBottom: '24px',
            }}>
              <div style={{ fontWeight: 600, color: '#3b82f6', fontSize: '0.85rem', marginBottom: '8px' }}>
                ℹ️ Di mana nomor ini ditampilkan?
              </div>
              <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                <li><strong>Halaman Utama (Footer)</strong> — Link "Butuh Bantuan? Chat WA Kami"</li>
                <li><strong>Halaman Pesanan Buyer</strong> — Tombol "Chat WhatsApp Admin" untuk complaint</li>
                <li><strong>Dashboard Mitra</strong> — Tombol "Laporkan Masalah Buyer" untuk eskalasi</li>
              </ul>
            </div>

            {/* Save Button */}
            {message && (
              <div style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: message.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${message.startsWith('✅') ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: message.startsWith('✅') ? '#22c55e' : '#ef4444',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '16px',
              }}>
                {message}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg"
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', justifyContent: 'center',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                border: 'none',
              }}
            >
              {saving ? <span className="loading-spinner" /> : '💾 Simpan Pengaturan'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
