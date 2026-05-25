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

interface Promo {
  id: string;
  product_id: number;
  promo_label: string;
  original_price: number;
  promo_price: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  product?: Product;
}

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'inactive'>('active');

  const [form, setForm] = useState({
    product_id: 0,
    promo_label: 'PROMO',
    promo_price: 0,
    start_date: '',
    end_date: '',
    is_active: true,
  });

  useEffect(() => {
    loadPromos();
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

  async function loadPromos() {
    setLoading(true);
    const { data } = await supabase
      .from('promos')
      .select('*, product:products(id, name, price, platform_name)')
      .order('created_at', { ascending: false });
    if (data) setPromos(data as unknown as Promo[]);
    setLoading(false);
  }

  function resetForm() {
    setForm({
      product_id: 0,
      promo_label: 'PROMO',
      promo_price: 0,
      start_date: new Date().toISOString().slice(0, 16),
      end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
      is_active: true,
    });
    setEditingId(null);
  }

  function handleProductSelect(productId: number) {
    const p = products.find(x => x.id === productId);
    setForm(prev => ({
      ...prev,
      product_id: productId,
      promo_price: p ? Math.round(p.price * 0.8) : 0,
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id) { alert('Pilih produk terlebih dahulu'); return; }

    const product = products.find(p => p.id === form.product_id);
    if (!product) { alert('Produk tidak ditemukan'); return; }

    const payload = {
      product_id: form.product_id,
      promo_label: form.promo_label || 'PROMO',
      original_price: product.price,
      promo_price: form.promo_price,
      start_date: new Date(form.start_date).toISOString(),
      end_date: new Date(form.end_date).toISOString(),
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (editingId) {
      result = await adminUpdate('promos', payload, { id: editingId });
    } else {
      result = await adminInsert('promos', { ...payload, created_at: new Date().toISOString() });
    }

    if (result.error) {
      alert('Gagal menyimpan: ' + result.error.message);
      return;
    }

    setShowForm(false);
    resetForm();
    loadPromos();
  }

  function handleEdit(promo: Promo) {
    setEditingId(promo.id);
    setForm({
      product_id: promo.product_id,
      promo_label: promo.promo_label,
      promo_price: promo.promo_price,
      start_date: promo.start_date.slice(0, 16),
      end_date: promo.end_date.slice(0, 16),
      is_active: promo.is_active,
    });
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus promo ini?')) return;
    await adminDelete('promos', { id });
    loadPromos();
  }

  async function toggleActive(promo: Promo) {
    await adminUpdate('promos', { is_active: !promo.is_active, updated_at: new Date().toISOString() }, { id: promo.id });
    loadPromos();
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getPromoStatus(promo: Promo): { label: string; color: string; bg: string } {
    const now = new Date();
    const start = new Date(promo.start_date);
    const end = new Date(promo.end_date);

    if (!promo.is_active) return { label: 'Nonaktif', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' };
    if (now < start) return { label: 'Dijadwalkan', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' };
    if (now > end) return { label: 'Berakhir', color: '#f87171', bg: 'rgba(248,113,113,0.1)' };
    return { label: 'Aktif', color: '#4ade80', bg: 'rgba(74,222,128,0.1)' };
  }

  function getDiscount(original: number, promo: number): number {
    if (original <= 0) return 0;
    return Math.round(((original - promo) / original) * 100);
  }

  const activePromos = promos.filter(p => {
    const now = new Date();
    return p.is_active && new Date(p.start_date) <= now && new Date(p.end_date) >= now;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Promo & Diskon</h1>
          <p style={{ color: 'var(--text-muted)' }}>Kelola harga promo untuk produk yang sedang didiskon.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(!showForm); if (!showForm) resetForm(); }}
        >
          {showForm ? 'Tutup Form' : '+ Buat Promo Baru'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">TOTAL PROMO</div>
          <div className="stat-value">{promos.length}</div>
          <div className="stat-icon">🏷️</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">PROMO AKTIF</div>
          <div className="stat-value" style={{ color: activePromos.length > 0 ? 'var(--brand-success)' : 'var(--text-muted)' }}>{activePromos.length}</div>
          <div className="stat-icon">🔥</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">PRODUK DIDISKON</div>
          <div className="stat-value">{new Set(activePromos.map(p => p.product_id)).size}</div>
          <div className="stat-icon">📦</div>
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
            {editingId ? '✏️ Edit Promo' : '🏷️ Buat Promo Baru'}
          </h2>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Pilih Produk</label>
                <select
                  required
                  className="form-input"
                  value={form.product_id || ''}
                  onChange={e => handleProductSelect(parseInt(e.target.value))}
                >
                  <option value="">— Pilih Produk —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.platform_name} — {p.name} ({formatPrice(p.price)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Label Promo</label>
                <input
                  className="form-input"
                  placeholder="Contoh: FLASH SALE"
                  value={form.promo_label}
                  onChange={e => setForm({ ...form, promo_label: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Harga Normal</label>
                <input
                  className="form-input"
                  disabled
                  value={form.product_id ? formatPrice(products.find(p => p.id === form.product_id)?.price || 0) : '-'}
                  style={{ opacity: 0.6 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Harga Promo</label>
                <input
                  required
                  type="number"
                  className="form-input"
                  min={0}
                  value={form.promo_price}
                  onChange={e => setForm({ ...form, promo_price: parseInt(e.target.value) || 0 })}
                />
                {form.product_id > 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--brand-success)', marginTop: '4px', fontWeight: 600 }}>
                    Diskon {getDiscount(products.find(p => p.id === form.product_id)?.price || 0, form.promo_price)}%
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Mulai</label>
                <input
                  required
                  type="datetime-local"
                  className="form-input"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Berakhir</label>
                <input
                  required
                  type="datetime-local"
                  className="form-input"
                  value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
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
              <button type="submit" className="btn btn-primary">{editingId ? 'Simpan Perubahan' : 'Buat Promo'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      {!loading && promos.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-secondary)', paddingBottom: '12px', overflowX: 'auto' }}>
          <button
            onClick={() => setActiveTab('active')}
            style={{
              background: activeTab === 'active' ? 'var(--bg-card)' : 'transparent',
              border: activeTab === 'active' ? '1px solid var(--border-secondary)' : '1px solid transparent',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              color: activeTab === 'active' ? '#4ade80' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            🔥 Promo Aktif ({promos.filter(p => p.is_active).length})
          </button>
          <button
            onClick={() => setActiveTab('inactive')}
            style={{
              background: activeTab === 'inactive' ? 'var(--bg-card)' : 'transparent',
              border: activeTab === 'inactive' ? '1px solid var(--border-secondary)' : '1px solid transparent',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              color: activeTab === 'inactive' ? '#f87171' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            ⏸️ Promo Nonaktif ({promos.filter(p => !p.is_active).length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              background: activeTab === 'all' ? 'var(--bg-card)' : 'transparent',
              border: activeTab === 'all' ? '1px solid var(--border-secondary)' : '1px solid transparent',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              color: activeTab === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            📋 Semua ({promos.length})
          </button>
        </div>
      )}

      {/* Promo List */}
      {loading ? (
        <div className="loading-page"><div className="loading-spinner" /></div>
      ) : promos.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🏷️</div>
          <h3>Belum ada promo</h3>
          <p>Klik &quot;+ Buat Promo Baru&quot; untuk mulai menarik pelanggan!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {promos.filter(p => {
            if (activeTab === 'active') return p.is_active;
            if (activeTab === 'inactive') return !p.is_active;
            return true;
          }).length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 0' }}>
              <div className="icon">📭</div>
              <h3>Tidak ada promo di kategori ini</h3>
            </div>
          ) : promos.filter(p => {
            if (activeTab === 'active') return p.is_active;
            if (activeTab === 'inactive') return !p.is_active;
            return true;
          }).map(promo => {
            const status = getPromoStatus(promo);
            const discount = getDiscount(promo.original_price, promo.promo_price);

            return (
              <div
                key={promo.id}
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
                  width: '60px',
                  height: '60px',
                  borderRadius: '16px',
                  background: discount > 0 ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'var(--bg-secondary)',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{discount}%</span>
                  <span style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>OFF</span>
                </div>

                {/* Product Info */}
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
                    <span style={{
                      background: 'rgba(239,68,68,0.1)',
                      color: '#f87171',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                    }}>
                      {promo.promo_label}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {promo.product?.name || `Product #${promo.product_id}`}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {promo.product?.platform_name} · {formatDate(promo.start_date)} — {formatDate(promo.end_date)}
                  </div>
                </div>

                {/* Price */}
                <div style={{ textAlign: 'right', minWidth: '140px' }}>
                  <div style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {formatPrice(promo.original_price)}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--brand-success)' }}>
                    {formatPrice(promo.promo_price)}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    className="btn btn-sm"
                    style={{
                      background: promo.is_active ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                      color: promo.is_active ? '#f87171' : '#4ade80',
                      border: `1px solid ${promo.is_active ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                      fontWeight: 600,
                    }}
                    onClick={() => toggleActive(promo)}
                  >
                    {promo.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(promo)}>Edit</button>
                  <button
                    className="btn btn-sm"
                    style={{ color: '#ef4444', background: 'none', border: '1px solid rgba(239,68,68,0.3)' }}
                    onClick={() => handleDelete(promo.id)}
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
