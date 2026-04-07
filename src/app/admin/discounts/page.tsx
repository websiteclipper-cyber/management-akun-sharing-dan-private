'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { adminInsert, adminUpdate, adminDelete } from '@/lib/adminApi';

interface Product {
  id: number;
  name: string;
  price: number;
  platform_name: string;
}

interface DiscountCampaign {
  id: string;
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  product_id: number | null;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export default function AdminDiscountsPage() {
  const [campaigns, setCampaigns] = useState<DiscountCampaign[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    discount_type: 'fixed' as 'fixed' | 'percentage',
    discount_value: 0,
    product_id: null as number | null,
    max_uses: null as number | null,
    valid_from: '',
    valid_until: '',
    is_active: true,
  });

  useEffect(() => {
    loadCampaigns();
    loadProducts();
  }, []);

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('id, name, price, platform_name')
      .eq('status', 'active')
      .order('name');
    if (data) setProducts(data);
  }

  async function loadCampaigns() {
    setLoading(true);
    const { data } = await supabase
      .from('discount_campaigns')
      .select('*, product:products(id, name, price, platform_name)')
      .order('created_at', { ascending: false });
    if (data) setCampaigns(data as unknown as DiscountCampaign[]);
    setLoading(false);
  }

  function resetForm() {
    setForm({
      code: '',
      discount_type: 'fixed',
      discount_value: 0,
      product_id: null,
      max_uses: null,
      valid_from: new Date().toISOString().slice(0, 16),
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
      is_active: true,
    });
    setEditingId(null);
  }

  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setForm(prev => ({ ...prev, code }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) { alert('Kode diskon wajib diisi'); return; }
    if (form.discount_value <= 0) { alert('Nilai diskon harus lebih dari 0'); return; }
    if (form.discount_type === 'percentage' && form.discount_value > 100) { alert('Persentase diskon maksimal 100%'); return; }

    const payload = {
      code: form.code.toUpperCase().trim(),
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      product_id: form.product_id || null,
      max_uses: form.max_uses || null,
      valid_from: new Date(form.valid_from).toISOString(),
      valid_until: new Date(form.valid_until).toISOString(),
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (editingId) {
      result = await adminUpdate('discount_campaigns', payload, { id: editingId });
    } else {
      result = await adminInsert('discount_campaigns', { ...payload, current_uses: 0, created_at: new Date().toISOString() });
    }

    if (result.error) {
      alert('Gagal menyimpan: ' + result.error.message);
      return;
    }

    setShowForm(false);
    resetForm();
    loadCampaigns();
  }

  function handleEdit(campaign: DiscountCampaign) {
    setEditingId(campaign.id);
    setForm({
      code: campaign.code,
      discount_type: campaign.discount_type,
      discount_value: campaign.discount_value,
      product_id: campaign.product_id,
      max_uses: campaign.max_uses,
      valid_from: campaign.valid_from.slice(0, 16),
      valid_until: campaign.valid_until.slice(0, 16),
      is_active: campaign.is_active,
    });
    setShowForm(true);
  }

  async function handleDeleteCampaign(id: string) {
    if (!confirm('Hapus kode diskon ini?')) return;
    await adminDelete('discount_campaigns', { id });
    loadCampaigns();
  }

  async function toggleActive(campaign: DiscountCampaign) {
    await adminUpdate('discount_campaigns', { is_active: !campaign.is_active, updated_at: new Date().toISOString() }, { id: campaign.id });
    loadCampaigns();
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopyFeedback(code);
    setTimeout(() => setCopyFeedback(null), 1500);
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getStatus(c: DiscountCampaign): { label: string; color: string; bg: string } {
    const now = new Date();
    const start = new Date(c.valid_from);
    const end = new Date(c.valid_until);

    if (!c.is_active) return { label: 'Nonaktif', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
    if (c.max_uses !== null && c.current_uses >= c.max_uses) return { label: 'Kuota Habis', color: '#f97316', bg: 'rgba(249,115,22,0.1)' };
    if (now < start) return { label: 'Dijadwalkan', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' };
    if (now > end) return { label: 'Kadaluarsa', color: '#f87171', bg: 'rgba(248,113,113,0.1)' };
    return { label: 'Aktif', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' };
  }

  const activeCampaigns = campaigns.filter(c => {
    const now = new Date();
    return c.is_active && new Date(c.valid_from) <= now && new Date(c.valid_until) >= now
      && (c.max_uses === null || c.current_uses < c.max_uses);
  });

  const totalRedeemed = campaigns.reduce((sum, c) => sum + c.current_uses, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Kode Diskon</h1>
          <p style={{ color: 'var(--text-muted)' }}>Kelola kampanye kode diskon / voucher untuk pembeli.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(!showForm); if (!showForm) resetForm(); }}
        >
          {showForm ? 'Tutup Form' : '+ Buat Kode Diskon'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">TOTAL KODE</div>
          <div className="stat-value">{campaigns.length}</div>
          <div className="stat-icon">🎟️</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">KODE AKTIF</div>
          <div className="stat-value" style={{ color: activeCampaigns.length > 0 ? 'var(--brand-success)' : 'var(--text-muted)' }}>{activeCampaigns.length}</div>
          <div className="stat-icon">✅</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TOTAL DIGUNAKAN</div>
          <div className="stat-value">{totalRedeemed}</div>
          <div className="stat-icon">📊</div>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          marginBottom: '24px',
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>
            {editingId ? '✏️ Edit Kode Diskon' : '🎟️ Buat Kode Diskon Baru'}
          </h2>
          <form onSubmit={handleSave}>
            {/* Row 1: Code & Type */}
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Kode Diskon</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    required
                    className="form-input"
                    placeholder="Contoh: LEBARAN2026"
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={generateCode}
                    title="Generate kode random"
                    style={{ minWidth: '42px', justifyContent: 'center' }}
                  >
                    🎲
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Tipe Diskon</label>
                <select
                  className="form-input"
                  value={form.discount_type}
                  onChange={e => setForm({ ...form, discount_type: e.target.value as 'fixed' | 'percentage' })}
                >
                  <option value="fixed">Nominal Tetap (Rp)</option>
                  <option value="percentage">Persentase (%)</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">
                  Nilai {form.discount_type === 'percentage' ? '(%)' : '(Rp)'}
                </label>
                <input
                  required
                  type="number"
                  className="form-input"
                  min={1}
                  max={form.discount_type === 'percentage' ? 100 : undefined}
                  value={form.discount_value || ''}
                  onChange={e => setForm({ ...form, discount_value: parseInt(e.target.value) || 0 })}
                  placeholder={form.discount_type === 'percentage' ? 'Misal: 10' : 'Misal: 15000'}
                />
              </div>
            </div>

            {/* Row 2: Product & Quota */}
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Berlaku Untuk Produk</label>
                <select
                  className="form-input"
                  value={form.product_id ?? ''}
                  onChange={e => setForm({ ...form, product_id: e.target.value ? parseInt(e.target.value) : null })}
                >
                  <option value="">Semua Produk</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.platform_name} — {p.name} ({formatPrice(p.price)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Kuota Penggunaan</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  placeholder="Unlimited"
                  value={form.max_uses ?? ''}
                  onChange={e => setForm({ ...form, max_uses: e.target.value ? parseInt(e.target.value) : null })}
                />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Kosongkan untuk tanpa batas
                </p>
              </div>
            </div>

            {/* Row 3: Date Range */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Mulai Berlaku</label>
                <input
                  required
                  type="datetime-local"
                  className="form-input"
                  value={form.valid_from}
                  onChange={e => setForm({ ...form, valid_from: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Berakhir</label>
                <input
                  required
                  type="datetime-local"
                  className="form-input"
                  value={form.valid_until}
                  onChange={e => setForm({ ...form, valid_until: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }}
                />
                Aktifkan langsung
              </label>
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Batal</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Simpan Perubahan' : 'Buat Kode Diskon'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Campaign List */}
      {loading ? (
        <div className="loading-page"><div className="loading-spinner" /></div>
      ) : campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🎟️</div>
          <h3>Belum ada kode diskon</h3>
          <p>Klik &quot;+ Buat Kode Diskon&quot; untuk membuat kampanye voucher baru!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {campaigns.map(campaign => {
            const status = getStatus(campaign);
            const usagePercent = campaign.max_uses ? Math.round((campaign.current_uses / campaign.max_uses) * 100) : null;

            return (
              <div
                key={campaign.id}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${status.label === 'Aktif' ? 'rgba(74,222,128,0.3)' : 'var(--border-secondary)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  flexWrap: 'wrap',
                  transition: 'all 0.2s',
                }}
              >
                {/* Discount Badge */}
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '16px',
                  background: campaign.discount_type === 'percentage'
                    ? 'linear-gradient(135deg, #8b5cf6, #a78bfa)'
                    : 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                }}>
                  {campaign.discount_type === 'percentage' ? (
                    <>
                      <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{campaign.discount_value}%</span>
                      <span style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>OFF</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.65rem', lineHeight: 1, opacity: 0.8 }}>Rp</span>
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>{(campaign.discount_value / 1000).toFixed(0)}K</span>
                      <span style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>OFF</span>
                    </>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{
                      background: status.bg,
                      color: status.color,
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {status.label}
                    </span>
                    {campaign.product_id ? (
                      <span style={{
                        background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
                        padding: '3px 10px', borderRadius: '999px',
                        fontSize: '0.7rem', fontWeight: 600,
                      }}>
                        {campaign.product?.name || `Produk #${campaign.product_id}`}
                      </span>
                    ) : (
                      <span style={{
                        background: 'rgba(148,163,184,0.1)', color: '#94a3b8',
                        padding: '3px 10px', borderRadius: '999px',
                        fontSize: '0.7rem', fontWeight: 600,
                      }}>
                        Semua Produk
                      </span>
                    )}
                  </div>

                  {/* Code display */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span
                      style={{
                        fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)',
                        letterSpacing: '1.5px', fontFamily: 'monospace',
                        cursor: 'pointer',
                      }}
                      onClick={() => copyCode(campaign.code)}
                      title="Klik untuk copy"
                    >
                      {campaign.code}
                    </span>
                    <button
                      onClick={() => copyCode(campaign.code)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px',
                        color: copyFeedback === campaign.code ? '#4ade80' : 'var(--text-muted)',
                        transition: 'all 0.2s',
                      }}
                    >
                      {copyFeedback === campaign.code ? '✓ Tersalin!' : '📋'}
                    </button>
                  </div>

                  {/* Date */}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {formatDate(campaign.valid_from)} — {formatDate(campaign.valid_until)}
                  </div>
                </div>

                {/* Usage */}
                <div style={{ textAlign: 'center', minWidth: '100px' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    Penggunaan
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                    {campaign.current_uses}{campaign.max_uses !== null ? ` / ${campaign.max_uses}` : ''}
                  </div>
                  {usagePercent !== null && (
                    <div style={{ marginTop: '6px', width: '100%' }}>
                      <div style={{
                        height: '4px', borderRadius: '999px',
                        background: 'var(--bg-secondary)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', borderRadius: '999px',
                          background: usagePercent >= 90 ? '#f87171' : usagePercent >= 70 ? '#fbbf24' : '#4ade80',
                          width: `${Math.min(usagePercent, 100)}%`,
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    style={{
                      background: campaign.is_active ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                      color: campaign.is_active ? '#f87171' : '#4ade80',
                      border: `1px solid ${campaign.is_active ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                      fontWeight: 600,
                    }}
                    onClick={() => toggleActive(campaign)}
                  >
                    {campaign.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(campaign)}>Edit</button>
                  <button
                    className="btn btn-sm"
                    style={{ color: '#ef4444', background: 'none', border: '1px solid rgba(239,68,68,0.3)' }}
                    onClick={() => handleDeleteCampaign(campaign.id)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
