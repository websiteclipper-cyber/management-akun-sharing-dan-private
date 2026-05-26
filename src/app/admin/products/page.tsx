'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { adminUpdate, adminInsert, adminDelete } from '@/lib/adminApi';
import { Product } from '@/lib/types';
import Link from 'next/link';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [isCopy, setIsCopy] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    setProducts(data || []);
    setLoading(false);
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <h2>Produk</h2>
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setIsCopy(false); setShowForm(true); }}>+ Tambah Produk</button>
      </div>
      <div style={{ padding: '32px' }}>
        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0' }}>
              <button 
                onClick={() => setActiveTab('active')} 
                style={{ 
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', 
                  fontWeight: activeTab === 'active' ? 600 : 400, 
                  color: activeTab === 'active' ? 'var(--brand-primary)' : 'var(--text-muted)',
                  borderBottom: activeTab === 'active' ? '2px solid var(--brand-primary)' : '2px solid transparent',
                  paddingBottom: '12px', marginBottom: '-1px'
                }}
              >
                Produk Aktif ({products.filter(p => p.status === 'active').length})
              </button>
              <button 
                onClick={() => setActiveTab('inactive')} 
                style={{ 
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', 
                  fontWeight: activeTab === 'inactive' ? 600 : 400, 
                  color: activeTab === 'inactive' ? 'var(--text-primary)' : 'var(--text-muted)',
                  borderBottom: activeTab === 'inactive' ? '2px solid var(--text-primary)' : '2px solid transparent',
                  paddingBottom: '12px', marginBottom: '-1px'
                }}
              >
                Diarsipkan / Nonaktif ({products.filter(p => p.status === 'inactive').length})
              </button>
            </div>
            <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Nama</th>
                  <th>Platform</th>
                  <th>Tipe</th>
                  <th>Harga</th>
                  <th>Harga Buyer Baru</th>
                  <th>Durasi Akun</th>
                  <th>Garansi</th>
                  <th>Max Slot</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {products.filter(p => p.status === activeTab).map(p => (
                  <tr key={p.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--brand-primary-light)' }}>{p.code}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.name}</td>
                    <td>{p.platform_name}</td>
                    <td>
                      <span className={`badge ${p.account_type === 'sharing' ? 'badge-info' : 'badge-primary'}`}>
                        {p.account_type}
                      </span>
                    </td>
                    <td style={{ color: 'var(--brand-success)' }}>{formatPrice(p.price)}</td>
                    <td style={{ color: p.newcomer_price ? '#3b82f6' : 'var(--text-muted)' }}>
                      {p.newcomer_price ? formatPrice(p.newcomer_price) : '—'}
                    </td>
                    <td>{p.duration_days} hari</td>
                    <td>{p.warranty_days || p.duration_days} hari</td>
                    <td>{p.default_max_slot}</td>
                    <td>
                      <span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditItem(p); setIsCopy(false); setShowForm(true); }}>Edit</button>
                        <button className="btn btn-info btn-sm" onClick={() => { setEditItem(p); setIsCopy(true); setShowForm(true); }}>Copy</button>
                        <button 
                          className={`btn btn-sm ${p.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                          onClick={async () => {
                            if (confirm(p.status === 'active' ? 'Nonaktifkan produk ini?' : 'Aktifkan produk ini?')) {
                              const result = await adminUpdate('products', { status: p.status === 'active' ? 'inactive' : 'active', updated_at: new Date().toISOString() }, { id: p.id });
                              if (result.error) { alert('Gagal: ' + result.error.message); return; }
                              loadProducts();
                            }
                          }}
                        >
                          {p.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button 
                          className="btn btn-danger btn-sm"
                          style={{ backgroundColor: '#dc2626' }}
                          onClick={async () => {
                            if (confirm(`Apakah Anda yakin ingin MENGHAPUS produk "${p.name}" permanen dari database?\n\nTindakan ini tidak dapat dibatalkan.`)) {
                              const result = await adminDelete('products', { id: p.id });
                              if (result.error) { 
                                if (result.error.message.includes('violates foreign key constraint') || result.error.message.includes('fkey')) {
                                  alert(`GAGAL MENGHAPUS: Produk "${p.name}" tidak dapat dihapus karena masih ada Stok Akun atau Pesanan yang terhubung ke produk ini.\n\nSolusi:\n1. Hapus Stok Akun terkait terlebih dahulu.\n2. ATAU cukup gunakan fitur "Nonaktifkan" agar produk tidak tampil di toko tanpa merusak riwayat data.`);
                                } else {
                                  alert('Gagal menghapus produk: ' + result.error.message); 
                                }
                                return; 
                              }
                              loadProducts();
                            }
                          }}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {products.filter(p => p.status === activeTab).length === 0 && (
                  <tr><td colSpan={10} className="empty-state"><div className="icon">📦</div><h3>Belum ada produk di kategori ini</h3></td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {showForm && (
        <ProductForm
          product={editItem}
          isCopy={isCopy}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); loadProducts(); }}
        />
      )}
    </div>
  );
}

function ProductForm({ product, isCopy, onClose, onSave }: { product: Product | null; isCopy?: boolean; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    code: product?.code ? (isCopy ? product.code + '-COPY' : product.code) : '',
    name: product?.name || '',
    platform_name: product?.platform_name || '',
    account_type: product?.account_type || 'sharing',
    price: product?.price?.toString() || '',
    newcomer_price: product?.newcomer_price?.toString() || '',
    duration_days: product?.duration_days?.toString() || '30',
    warranty_days: product?.warranty_days?.toString() || product?.duration_days?.toString() || '30',
    default_max_slot: product?.default_max_slot?.toString() || '4',
    description: product?.description || '',
    terms: product?.terms || '',
    status: product?.status || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      code: form.code,
      name: form.name,
      platform_name: form.platform_name,
      account_type: form.account_type,
      price: parseFloat(form.price),
      newcomer_price: form.newcomer_price ? parseFloat(form.newcomer_price) : null,
      duration_days: parseInt(form.duration_days),
      warranty_days: parseInt(form.warranty_days),
      default_max_slot: parseInt(form.default_max_slot),
      description: form.description || null,
      terms: form.terms || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (product && !isCopy) {
      result = await adminUpdate('products', payload, { id: product.id });
    } else {
      result = await adminInsert('products', { ...payload, created_at: new Date().toISOString() });
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }
    onSave();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{product ? (isCopy ? 'Copy / Duplikat Produk' : 'Edit Produk') : 'Tambah Produk Baru'}</h3>
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Kode Produk</label>
              <input className="form-input" value={form.code} onChange={e => setForm({...form, code: e.target.value})} placeholder="NETFLIX-SHARING-30D" required />
            </div>
            <div className="form-group">
              <label className="form-label">Platform</label>
              <input className="form-input" value={form.platform_name} onChange={e => setForm({...form, platform_name: e.target.value})} placeholder="Netflix" required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nama Produk</label>
            <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Netflix Premium Sharing 30 Hari" required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipe Akun</label>
              <select className="form-select" value={form.account_type} onChange={e => setForm({...form, account_type: e.target.value as 'sharing' | 'private'})}>
                <option value="sharing">Sharing</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Max Slot</label>
              <input type="number" className="form-input" value={form.default_max_slot} onChange={e => setForm({...form, default_max_slot: e.target.value})} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Harga (IDR)</label>
              <input type="number" className="form-input" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="50000" required />
            </div>
            <div className="form-group">
              <label className="form-label">Harga Buyer Baru (IDR)</label>
              <input type="number" className="form-input" value={form.newcomer_price} onChange={e => setForm({...form, newcomer_price: e.target.value})} placeholder="Kosongkan jika tidak ada" />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Harga spesial untuk pembelian pertama. Kosongkan jika tidak pakai.</small>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Durasi Akun (hari)</label>
              <input type="number" className="form-input" value={form.duration_days} onChange={e => setForm({...form, duration_days: e.target.value})} required />
            </div>
            <div className="form-group">
              <label className="form-label">Durasi Garansi (hari)</label>
              <input type="number" className="form-input" value={form.warranty_days} onChange={e => setForm({...form, warranty_days: e.target.value})} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Deskripsi</label>
            <textarea className="form-textarea" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Deskripsi produk..." />
          </div>
          <div className="form-group">
            <label className="form-label">Ketentuan Khusus Produk</label>
            <textarea className="form-textarea" value={form.terms} onChange={e => setForm({...form, terms: e.target.value})} placeholder="Misal: Dilarang ganti password, dilarang edit profil orang lain, dll..." style={{ minHeight: '100px' }} />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>Catatan khusus ini akan ditampilkan di halaman pembelian (checkout) dan halaman ketentuan.</small>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={form.status} onChange={e => setForm({...form, status: e.target.value as 'active' | 'inactive'})}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="loading-spinner" /> : (product && !isCopy ? 'Simpan' : 'Tambah')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
