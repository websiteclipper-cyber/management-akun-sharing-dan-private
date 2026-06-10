'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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
  const [promos, setPromos] = useState<any[]>([]);

  useEffect(() => { 
    loadSettings(); 
    loadPromos();
  }, []);

  async function loadPromos() {
    const { data } = await supabase
      .from('promos')
      .select('*, product:products(name, platform_name)')
      .eq('is_active', true);
    if (data) setPromos(data);
  }

  async function loadSettings() {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (data.settings && data.settings.length > 0) {
        // Merge with defaults to ensure all keys exist
        const merged = ensureDefaults(data.settings);
        setSettings(merged);
      } else {
        // Set defaults if empty
        setSettings(getDefaults());
      }
    } catch {
      setSettings(getDefaults());
    }
    setLoading(false);
  }

  function getDefaults(): Setting[] {
    return [
      { key: 'support_whatsapp', value: '082244046330', label: 'Nomor WhatsApp Support' },
      { key: 'leaderboard_min_commission', value: '50000', label: 'Leaderboard Min Komisi (Rp)' },
      { key: 'leaderboard_max_commission', value: '500000', label: 'Leaderboard Max Komisi (Rp)' },
      { key: 'global_promo_active', value: 'false', label: 'Aktifkan Global Promo Popup' },
      { key: 'global_promo_platform', value: 'CHATGPT', label: 'Platform Icon Global Promo' },
      { key: 'global_promo_title', value: 'Promo Spesial', label: 'Judul Global Promo' },
      { key: 'global_promo_subtitle', value: 'ChatGPT Pro', label: 'Sub-judul Global Promo' },
      { key: 'global_promo_badge', value: 'FULL GARANSI', label: 'Badge Global Promo' },
      { key: 'global_promo_normal_price', value: '5000000', label: 'Harga Normal Global Promo' },
      { key: 'global_promo_price', value: '100000', label: 'Harga Diskon Global Promo' },
      { key: 'global_promo_btn_text', value: 'AMBIL PROMO SEKARANG', label: 'Teks Tombol Global Promo' },
      { key: 'global_promo_btn_link', value: '#katalog', label: 'Link Tombol Global Promo' },
    ];
  }

  function ensureDefaults(existing: Setting[]): Setting[] {
    const defaults = getDefaults();
    const keys = existing.map(s => s.key);
    const merged = [...existing];
    for (const d of defaults) {
      if (!keys.includes(d.key)) {
        merged.push(d);
      }
    }
    return merged;
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
  const minCommission = settings.find(s => s.key === 'leaderboard_min_commission')?.value || '50000';
  const maxCommission = settings.find(s => s.key === 'leaderboard_max_commission')?.value || '500000';

  const promoActive = settings.find(s => s.key === 'global_promo_active')?.value === 'true';
  const promoPlatform = settings.find(s => s.key === 'global_promo_platform')?.value || 'CHATGPT';
  const promoTitle = settings.find(s => s.key === 'global_promo_title')?.value || 'Promo Spesial';
  const promoSubtitle = settings.find(s => s.key === 'global_promo_subtitle')?.value || 'ChatGPT Pro';
  const promoBadge = settings.find(s => s.key === 'global_promo_badge')?.value || 'FULL GARANSI';
  const promoNormalPrice = settings.find(s => s.key === 'global_promo_normal_price')?.value || '5000000';
  const promoPrice = settings.find(s => s.key === 'global_promo_price')?.value || '100000';
  const promoBtnText = settings.find(s => s.key === 'global_promo_btn_text')?.value || 'AMBIL PROMO SEKARANG';
  const promoBtnLink = settings.find(s => s.key === 'global_promo_btn_link')?.value || '#katalog';

  // Format phone for display
  function formatPhone(phone: string): string {
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) return '+62' + clean.substring(1);
    if (clean.startsWith('62')) return '+' + clean;
    return clean;
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
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

            {/* ── Leaderboard Auto-Reset Settings ── */}
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
                  background: 'rgba(251,191,36,0.15)', color: '#f59e0b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem',
                }}>🏆</div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2px' }}>Leaderboard Auto-Reset</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Leaderboard dummy akan otomatis di-reset setiap hari pukul 00:00 WIB dengan komisi acak.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Minimal Komisi (Rp)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={minCommission}
                    onChange={e => updateSetting('leaderboard_min_commission', e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="50000"
                    min={0}
                    style={{ fontSize: '1.05rem', fontWeight: 600 }}
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Nilai terendah komisi acak yang bisa muncul.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Maksimal Komisi (Rp)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={maxCommission}
                    onChange={e => updateSetting('leaderboard_max_commission', e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="500000"
                    min={0}
                    style={{ fontSize: '1.05rem', fontWeight: 600 }}
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Nilai tertinggi komisi acak yang bisa muncul.
                  </p>
                </div>
              </div>

              {/* Preview range */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginTop: '8px',
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  💡 Info Reset Otomatis
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <div>Setiap hari pada jam <strong>00:00 WIB</strong>, semua komisi mitra dummy akan diacak ulang.</div>
                  <div style={{ marginTop: '6px' }}>
                    Range komisi: <strong style={{ color: 'var(--brand-success)' }}>{formatPrice(Number(minCommission) || 0)}</strong>
                    {' '}—{' '}
                    <strong style={{ color: 'var(--brand-success)' }}>{formatPrice(Number(maxCommission) || 0)}</strong>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Nilai akan dibulatkan ke kelipatan Rp 1.000 dan ranking otomatis diurutkan dari komisi tertinggi.
                  </div>
                </div>
              </div>
            </div>

            {/* ── Global Promo Popup Settings ── */}
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
                  background: 'rgba(236,72,153,0.15)', color: '#ec4899',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.4rem',
                }}>✨</div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '2px' }}>Global Promo Popup</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Popup promo khusus yang muncul saat user pertama kali membuka web.
                  </p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={promoActive}
                    onChange={e => updateSetting('global_promo_active', e.target.checked ? 'true' : 'false')}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--brand-success)' }}
                  />
                  Aktifkan Popup
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', opacity: promoActive ? 1 : 0.6, pointerEvents: promoActive ? 'auto' : 'none', transition: 'all 0.2s' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1', background: 'rgba(74,222,128,0.05)', padding: '16px', borderRadius: '12px', border: '1px dashed rgba(74,222,128,0.3)' }}>
                  <label className="form-label" style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚡ Isi Otomatis dari Promo & Diskon
                  </label>
                  <select
                    className="form-input"
                    onChange={(e) => {
                      const promo = promos.find(p => p.id === e.target.value);
                      if (promo) {
                        // Check if platform icon is available in dropdown, else DEFAULT
                        const validPlatforms = ['CHATGPT', 'NETFLIX', 'SPOTIFY', 'CANVA', 'YOUTUBE', 'DISNEY', 'APPLE', 'DEFAULT'];
                        const pName = (promo.product?.platform_name || '').toUpperCase();
                        const finalPlatform = validPlatforms.includes(pName) ? pName : 'DEFAULT';
                        
                        setSettings(prev => {
                          const updated = [...prev];
                          const setVal = (k: string, v: string) => {
                            const idx = updated.findIndex(s => s.key === k);
                            if (idx >= 0) updated[idx].value = v;
                          };
                          setVal('global_promo_platform', finalPlatform);
                          setVal('global_promo_subtitle', promo.product?.name || '');
                          setVal('global_promo_badge', promo.promo_label || 'PROMO');
                          setVal('global_promo_normal_price', promo.original_price.toString());
                          setVal('global_promo_price', promo.promo_price.toString());
                          return updated;
                        });
                      }
                    }}
                    style={{ background: 'var(--bg-secondary)', borderColor: 'rgba(74,222,128,0.2)' }}
                  >
                    <option value="">— Pilih Promo Aktif (Akan otomatis mengisi form di bawah) —</option>
                    {promos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.product?.platform_name} - {p.product?.name} (Diskon {formatPrice(p.promo_price)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ikon Platform</label>
                  <select
                    className="form-input"
                    value={promoPlatform}
                    onChange={e => updateSetting('global_promo_platform', e.target.value)}
                  >
                    <option value="CHATGPT">ChatGPT</option>
                    <option value="NETFLIX">Netflix</option>
                    <option value="SPOTIFY">Spotify</option>
                    <option value="CANVA">Canva</option>
                    <option value="YOUTUBE">YouTube</option>
                    <option value="DISNEY">Disney</option>
                    <option value="APPLE">Apple</option>
                    <option value="DEFAULT">Lainnya (Bintang)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Judul Popup</label>
                  <input className="form-input" value={promoTitle} onChange={e => updateSetting('global_promo_title', e.target.value)} placeholder="Promo Spesial" />
                </div>
                <div className="form-group">
                  <label className="form-label">Sub-judul (Nama Produk)</label>
                  <input className="form-input" value={promoSubtitle} onChange={e => updateSetting('global_promo_subtitle', e.target.value)} placeholder="ChatGPT Pro" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teks Badge / Garansi</label>
                  <input className="form-input" value={promoBadge} onChange={e => updateSetting('global_promo_badge', e.target.value)} placeholder="FULL GARANSI" />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga Normal (Dicoret)</label>
                  <input className="form-input" type="number" value={promoNormalPrice} onChange={e => updateSetting('global_promo_normal_price', e.target.value)} placeholder="5000000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga Diskon (Aktif)</label>
                  <input className="form-input" type="number" value={promoPrice} onChange={e => updateSetting('global_promo_price', e.target.value)} placeholder="100000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Teks Tombol CTA</label>
                  <input className="form-input" value={promoBtnText} onChange={e => updateSetting('global_promo_btn_text', e.target.value)} placeholder="AMBIL PROMO SEKARANG" />
                </div>
                <div className="form-group">
                  <label className="form-label">Link Tombol CTA</label>
                  <input className="form-input" value={promoBtnLink} onChange={e => updateSetting('global_promo_btn_link', e.target.value)} placeholder="#katalog atau /buyer/login" />
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
                <li><strong>Halaman Utama (Footer)</strong> — Link &quot;Butuh Bantuan? Chat WA Kami&quot;</li>
                <li><strong>Halaman Pesanan Buyer</strong> — Tombol &quot;Chat WhatsApp Admin&quot; untuk complaint</li>
                <li><strong>Dashboard Mitra</strong> — Tombol &quot;Laporkan Masalah Buyer&quot; untuk eskalasi</li>
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
