'use client';

import { useState, useEffect, useMemo } from 'react';

function getAdminAuthHeaders(): HeadersInit {
  const token = typeof window === 'undefined' ? '' : localStorage.getItem('admin_token') || '';
  return { 'Authorization': `Bearer ${token}` };
}

export default function AdminBackupAccounts() {
  const [backups, setBackups] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stockAccounts, setStockAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [formData, setFormData] = useState({
    id: '', stock_account_id: '', product_id: '',
    account_identifier: '', account_secret: '',
    profile_info: '', pin_info: '', notes: ''
  });
  const [bulkText, setBulkText] = useState('');
  const [bulkProductId, setBulkProductId] = useState('');
  const [bulkStockAccountId, setBulkStockAccountId] = useState('');
  const [showPassword, setShowPassword] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchBackups();
    fetchProducts();
    fetchStockAccounts();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backup-accounts', { headers: getAdminAuthHeaders() });
      const data = await res.json();
      setBackups(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/admin/products', { headers: getAdminAuthHeaders() });
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {}
  };

  const fetchStockAccounts = async () => {
    try {
      const res = await fetch('/api/admin/inventory', { headers: getAdminAuthHeaders() });
      const data = await res.json();
      setStockAccounts(Array.isArray(data) ? data : []);
    } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editMode ? 'PUT' : 'POST';
    const payload = { ...formData };

    await fetch('/api/admin/backup-accounts', {
      method,
      headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
      body: JSON.stringify(payload)
    });

    setShowModal(false);
    resetForm();
    fetchBackups();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus akun cadangan ini?')) return;
    await fetch(`/api/admin/backup-accounts?id=${id}`, {
      method: 'DELETE',
      headers: getAdminAuthHeaders(),
    });
    fetchBackups();
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    if (!bulkProductId && !bulkStockAccountId) {
      alert('Pilih produk atau stok akun terlebih dahulu');
      return;
    }

    const lines = bulkText.trim().split('\n').filter(l => l.trim());
    let imported = 0;

    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 2) {
        await fetch('/api/admin/backup-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify({
            stock_account_id: bulkStockAccountId || undefined,
            product_id: bulkProductId || undefined,
            account_identifier: parts[0],
            account_secret: parts[1],
            profile_info: parts[2] || '',
            pin_info: parts[3] || '',
          })
        });
        imported++;
      } else if (parts.length === 1 && (parts[0].startsWith('http://') || parts[0].startsWith('https://'))) {
        // Link-based backup (e.g., invitation link)
        await fetch('/api/admin/backup-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify({
            stock_account_id: bulkStockAccountId || undefined,
            product_id: bulkProductId || undefined,
            account_identifier: parts[0],
            account_secret: 'link',
          })
        });
        imported++;
      }
    }

    alert(`${imported} akun cadangan berhasil diimpor!`);
    setBulkText('');
    setShowBulk(false);
    fetchBackups();
  };

  const resetForm = () => {
    setFormData({ id: '', stock_account_id: '', product_id: '', account_identifier: '', account_secret: '', profile_info: '', pin_info: '', notes: '' });
    setEditMode(false);
  };

  const decryptPassword = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/backup-accounts/decrypt?id=${id}`, {
        headers: getAdminAuthHeaders(),
      });
      const data = await res.json();
      setShowPassword(prev => ({ ...prev, [id]: data.secret || '(kosong)' }));
    } catch {
      setShowPassword(prev => ({ ...prev, [id]: '(error)' }));
    }
  };

  // Stats
  const stats = useMemo(() => ({
    total: backups.length,
    available: backups.filter(b => !b.is_used && b.status !== 'used').length,
    used: backups.filter(b => b.is_used || b.status === 'used').length,
  }), [backups]);

  // Filtered
  const filteredBackups = useMemo(() => {
    let result = backups;
    if (filterProduct !== 'all') {
      result = result.filter(b => {
        const pid = b.product_id || b.stock_accounts?.product_id;
        return String(pid) === filterProduct;
      });
    }
    if (filterStatus !== 'all') {
      if (filterStatus === 'available') result = result.filter(b => !b.is_used);
      else if (filterStatus === 'used') result = result.filter(b => b.is_used);
    }
    return result;
  }, [backups, filterProduct, filterStatus]);

  const getProductName = (b: any) => {
    if (b.products?.name) return b.products.name;
    if (b.stock_accounts?.products?.name) return b.stock_accounts.products.name;
    return '-';
  };

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <h2>📦 Akun Cadangan (Backup)</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowBulk(true)} className="btn btn-secondary">📋 Bulk Import</button>
          <button onClick={() => { resetForm(); setShowModal(true); }} className="btn btn-primary">+ Tambah Backup</button>
        </div>
      </div>

      <div style={{ padding: '32px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total Backup', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Tersedia', value: stats.available, color: '#22c55e' },
            { label: 'Terpakai', value: stats.used, color: '#ef4444' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Produk:</span>
            <select className="form-select" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '4px 10px', minWidth: '140px' }}>
              <option value="all">Semua</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status:</span>
            {['all', 'available', 'used'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '4px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600,
                  border: '1px solid', cursor: 'pointer', transition: 'all 0.2s',
                  background: filterStatus === s ? 'var(--accent)' : 'transparent',
                  color: filterStatus === s ? '#fff' : 'var(--text-muted)',
                  borderColor: filterStatus === s ? 'var(--accent)' : 'var(--border-secondary)',
                }}
              >
                {s === 'all' ? 'Semua' : s === 'available' ? '🟢 Tersedia' : '🔴 Terpakai'}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {filteredBackups.length} akun
          </span>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Produk</th>
                <th>Linked Stock</th>
                <th>Email / Identifier</th>
                <th>Password</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-state"><div className="loading-spinner" /></td></tr>
              ) : filteredBackups.length === 0 ? (
                <tr><td colSpan={7} className="empty-state"><div className="icon">📦</div><h3>Belum ada akun cadangan</h3></td></tr>
              ) : (
                filteredBackups.map((b, i) => (
                  <tr key={b.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{getProductName(b)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {b.stock_accounts?.account_identifier || '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {b.account_identifier}
                    </td>
                    <td>
                      {showPassword[b.id] ? (
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#eab308' }}>{showPassword[b.id]}</span>
                      ) : (
                        <button onClick={() => decryptPassword(b.id)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem' }}>
                          👁 Lihat
                        </button>
                      )}
                    </td>
                    <td>
                      {b.is_used ? (
                        <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                          🔴 Terpakai
                        </span>
                      ) : (
                        <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                          🟢 Tersedia
                        </span>
                      )}
                    </td>
                    <td style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => {
                        setFormData({
                          id: b.id,
                          stock_account_id: b.stock_account_id || '',
                          product_id: b.product_id || '',
                          account_identifier: b.account_identifier,
                          account_secret: '',
                          profile_info: b.profile_info || '',
                          pin_info: b.pin_info || '',
                          notes: b.notes || '',
                        });
                        setEditMode(true);
                        setShowModal(true);
                      }} className="btn btn-secondary btn-sm">✏️</button>
                      <button onClick={() => handleDelete(b.id)} className="btn btn-secondary btn-sm" style={{ color: '#ef4444' }}>🗑</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{editMode ? '✏️ Edit' : '➕ Tambah'} Akun Cadangan</h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Produk</label>
                <select className="form-select" value={formData.product_id} onChange={e => setFormData({...formData, product_id: e.target.value})}>
                  <option value="">-- Pilih Produk (opsional) --</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Stok Akun Utama (opsional)</label>
                <select className="form-select" value={formData.stock_account_id} onChange={e => setFormData({...formData, stock_account_id: e.target.value})}>
                  <option value="">-- Pilih Stok Akun --</option>
                  {stockAccounts
                    .filter((s: any) => !formData.product_id || String(s.product_id) === formData.product_id)
                    .map((s: any) => (
                      <option key={s.id} value={s.id}>{s.account_identifier} ({s.products?.name || 'N/A'})</option>
                    ))}
                </select>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Link backup ke akun stok tertentu untuk penggantian presisi</span>
              </div>
              <div className="form-group">
                <label className="form-label">Email / Username *</label>
                <input className="form-input" required value={formData.account_identifier} onChange={e => setFormData({...formData, account_identifier: e.target.value})} placeholder="backup@email.com" />
              </div>
              <div className="form-group">
                <label className="form-label">{editMode ? 'Password (kosongkan jika tidak diubah)' : 'Password *'}</label>
                <input className="form-input" type="password" required={!editMode} value={formData.account_secret} onChange={e => setFormData({...formData, account_secret: e.target.value})} placeholder="••••••••" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="form-group">
                  <label className="form-label">Profile Info</label>
                  <input className="form-input" value={formData.profile_info} onChange={e => setFormData({...formData, profile_info: e.target.value})} placeholder="Nama profil..." />
                </div>
                <div className="form-group">
                  <label className="form-label">PIN</label>
                  <input className="form-input" value={formData.pin_info} onChange={e => setFormData({...formData, pin_info: e.target.value})} placeholder="1234" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea className="form-textarea" rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Catatan internal..." />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Batal</button>
                <button type="submit" className="btn btn-primary">💾 Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="modal-overlay" onClick={() => setShowBulk(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">📋 Bulk Import Akun Cadangan</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Produk *</label>
                <select className="form-select" value={bulkProductId} onChange={e => setBulkProductId(e.target.value)}>
                  <option value="">-- Pilih Produk --</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Stok Akun Utama (opsional)</label>
                <select className="form-select" value={bulkStockAccountId} onChange={e => setBulkStockAccountId(e.target.value)}>
                  <option value="">-- Tidak di-link ke stok akun --</option>
                  {stockAccounts
                    .filter((s: any) => !bulkProductId || String(s.product_id) === bulkProductId)
                    .map((s: any) => (
                      <option key={s.id} value={s.id}>{s.account_identifier} ({s.products?.name || 'N/A'})</option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data Akun (1 per baris)</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder={`Format: email|password\nContoh:\nbackup1@email.com|password123\nbackup2@email.com|secretpass\nhttps://link-invitation.com/xxx`}
                  style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Format: email|password atau link per baris. Mendukung format: email|password|profile|pin
                </span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulk(false)}>Batal</button>
                <button type="button" className="btn btn-primary" onClick={handleBulkImport}>
                  📥 Import {bulkText.trim().split('\n').filter(l => l.trim()).length} Akun
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
