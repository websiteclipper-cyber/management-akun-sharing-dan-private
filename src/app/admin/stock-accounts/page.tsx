'use client';

import { useState, useEffect, useMemo } from 'react';
import { adminDelete, adminSelect, adminUpdate } from '@/lib/adminApi';
import { StockAccount, Product } from '@/lib/types';

const ITEMS_PER_PAGE = 15;

function supportsTwoFactorLive(product?: Product) {
  if (!product) return false;
  return /(?:chat\s*gpt|openai|gpt)/i.test(`${product.code} ${product.name} ${product.platform_name}`);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

interface BackupSummary {
  id: number;
  stock_account_id: number | null;
  is_used: boolean;
}

function getAdminAuthHeaders(): HeadersInit {
  const token = typeof window === 'undefined' ? '' : localStorage.getItem('admin_token') || '';
  return { 'Authorization': `Bearer ${token}` };
}

export default function StockAccountsPage() {
  const [accounts, setAccounts] = useState<StockAccount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editItem, setEditItem] = useState<StockAccount | null>(null);
  const [isCopy, setIsCopy] = useState(false);
  const [showBuyers, setShowBuyers] = useState<number | null>(null);
  const [buyers, setBuyers] = useState<Array<{ id: number; buyer_name: string; status: string; start_at: string; expired_at: string }>>([]); 
  const [backupCounts, setBackupCounts] = useState<Record<number, { available: number; total: number }>>({});
  const [loadError, setLoadError] = useState('');

  // Feature 4: Search & Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'identifier'>('newest');

  async function loadData() {
    setLoading(true);
    setLoadError('');
    const [accountResult, productResult, backupResponse] = await Promise.all([
      adminSelect(
        'stock_accounts',
        'id, product_id, account_identifier, profile_info, pin_info, notes_internal, account_type, max_slot, current_used_slot, status, purchase_cost, acquired_at, created_at, updated_at, product:products(*)',
      ),
      adminSelect('products', '*', { status: 'active' }),
      fetch('/api/admin/backup-accounts?summary=1', { headers: getAdminAuthHeaders() }),
    ]);
    if (accountResult.error || productResult.error || !backupResponse.ok) {
      setLoadError('Gagal memuat stok akun. Silakan login ulang atau muat ulang halaman.');
      setLoading(false);
      return;
    }

    const accs = accountResult.data;
    const prods = productResult.data;
    const backups = backupResponse.ok ? await backupResponse.json() as BackupSummary[] : [];
    setAccounts(((accs || []) as StockAccount[]).sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    ));
    setProducts(((prods || []) as Product[]).sort((a, b) => a.name.localeCompare(b.name)));
    
    // Calculate backup counts per stock account
    const counts: Record<number, { available: number; total: number }> = {};
    backups.forEach((b) => {
      if (b.stock_account_id) {
        if (!counts[b.stock_account_id]) counts[b.stock_account_id] = { available: 0, total: 0 };
        counts[b.stock_account_id].total++;
        if (!b.is_used) counts[b.stock_account_id].available++;
      }
    });
    setBackupCounts(counts);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function loadBuyers(accountId: number) {
    const { data } = await adminSelect(
      'account_assignments',
      'id, status, start_at, expired_at, buyer:buyers(name)',
      { stock_account_id: accountId, status: 'active' },
    );
    setBuyers((data || []).map((d: Record<string, unknown>) => ({
      id: d.id as number,
      buyer_name: (d.buyer as Record<string, unknown>)?.name as string || 'Unknown',
      status: d.status as string,
      start_at: d.start_at as string,
      expired_at: d.expired_at as string,
    })));
    setShowBuyers(accountId);
  }

  function getSlotClass(used: number, max: number) {
    const pct = (used / max) * 100;
    if (pct >= 100) return 'full';
    if (pct >= 50) return 'medium';
    return 'low';
  }

  async function handleDelete(id: number) {
    if (!confirm('Apakah Anda yakin ingin menghapus stok akun ini? Data yang dihapus tidak bisa dikembalikan.')) return;
    try {
      const res = await adminDelete('stock_accounts', { id });
      if (res.error) { alert('Gagal: ' + res.error.message); return; }
      loadData();
    } catch {
      alert('Gagal menghapus stok akun.');
    }
  }

  // Feature 4: Filtered & paginated data
  const filteredAccounts = useMemo(() => {
    let result = [...accounts];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.account_identifier.toLowerCase().includes(q) ||
        (a.product as unknown as Product)?.name?.toLowerCase().includes(q) ||
        (a.product as unknown as Product)?.platform_name?.toLowerCase().includes(q) ||
        a.notes_internal?.toLowerCase().includes(q) ||
        a.profile_info?.toLowerCase().includes(q) ||
        a.id.toString().includes(q)
      );
    }

    // Product filter
    if (filterProduct !== 'all') {
      result = result.filter(a => a.product_id.toString() === filterProduct);
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(a => a.status === filterStatus);
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(a => a.account_type === filterType);
    }

    // Sort
    if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'identifier') {
      result.sort((a, b) => a.account_identifier.localeCompare(b.account_identifier));
    }
    // 'newest' is default order from API

    return result;
  }, [accounts, searchQuery, filterProduct, filterStatus, filterType, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE));
  const paginatedAccounts = filteredAccounts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterProduct, filterStatus, filterType, sortBy]);

  // Stats
  const stats = useMemo(() => ({
    total: accounts.length,
    active: accounts.filter(a => a.status === 'active').length,
    full: accounts.filter(a => a.status === 'full').length,
    inactive: accounts.filter(a => !['active', 'full'].includes(a.status)).length,
    sharing: accounts.filter(a => a.account_type === 'sharing').length,
    private: accounts.filter(a => a.account_type === 'private').length,
  }), [accounts]);

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <h2>Stok Akun</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-info" onClick={() => setShowBulk(true)}>📥 Import Massal</button>
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setIsCopy(false); setShowForm(true); }}>+ Tambah Stok</button>
        </div>
      </div>
      <div style={{ padding: '32px' }}>
        {loadError && <div className="login-error" style={{ marginBottom: '16px' }}>{loadError}</div>}
        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Total', value: stats.total, color: 'var(--text-primary)' },
            { label: 'Active', value: stats.active, color: '#22c55e' },
            { label: 'Full', value: stats.full, color: '#eab308' },
            { label: 'Others', value: stats.inactive, color: '#71717a' },
            { label: 'Sharing', value: stats.sharing, color: '#3b82f6' },
            { label: 'Private', value: stats.private, color: '#8b5cf6' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-md)', padding: '12px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search & Filters */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Search */}
            <div style={{ flex: '1 1 250px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                🔍 Cari
              </label>
              <input
                className="form-input"
                placeholder="Cari email, produk, catatan..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ height: '36px', fontSize: '0.85rem' }}
              />
            </div>
            {/* Product filter */}
            <div style={{ flex: '0 0 180px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Produk
              </label>
              <select className="form-select" value={filterProduct} onChange={e => setFilterProduct(e.target.value)} style={{ height: '36px', fontSize: '0.85rem' }}>
                <option value="all">Semua Produk</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {/* Status filter */}
            <div style={{ flex: '0 0 140px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Status
              </label>
              <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ height: '36px', fontSize: '0.85rem' }}>
                <option value="all">Semua Status</option>
                <option value="active">Active</option>
                <option value="full">Full</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
                <option value="broken">Broken</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            {/* Type filter */}
            <div style={{ flex: '0 0 140px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Tipe
              </label>
              <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ height: '36px', fontSize: '0.85rem' }}>
                <option value="all">Semua Tipe</option>
                <option value="sharing">Sharing</option>
                <option value="private">Private</option>
              </select>
            </div>
            {/* Sort */}
            <div style={{ flex: '0 0 140px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Urutkan
              </label>
              <select className="form-select" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ height: '36px', fontSize: '0.85rem' }}>
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
                <option value="identifier">A-Z Email</option>
              </select>
            </div>
          </div>
          {/* Results info */}
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Menampilkan {paginatedAccounts.length} dari {filteredAccounts.length} akun
            {filteredAccounts.length !== accounts.length && ` (Total: ${accounts.length})`}
          </div>
        </div>

        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tanggal Input</th>
                    <th>Produk</th>
                    <th>Identifier</th>
                    <th>Tipe</th>
                    <th>Slot Usage</th>
                    <th>Backup</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAccounts.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'monospace' }}>#{a.id}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {new Date(a.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{(a.product as unknown as Product)?.name || '-'}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--brand-accent)' }}>{a.account_identifier}</td>
                      <td>
                        <span className={`badge ${a.account_type === 'sharing' ? 'badge-info' : 'badge-primary'}`}>
                          {a.account_type}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {a.current_used_slot}/{a.max_slot}
                          </span>
                          <div className="slot-bar" style={{ flex: 1 }}>
                            <div
                              className={`slot-bar-fill ${getSlotClass(a.current_used_slot, a.max_slot)}`}
                              style={{ width: `${(a.current_used_slot / a.max_slot) * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        {backupCounts[a.id] ? (
                          <span style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                            background: backupCounts[a.id].available > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                            color: backupCounts[a.id].available > 0 ? '#22c55e' : '#ef4444',
                          }}>
                            {backupCounts[a.id].available}/{backupCounts[a.id].total}
                          </span>
                        ) : (
                          <span style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                            background: 'rgba(239,68,68,0.12)',
                            color: '#ef4444',
                          }}>
                            0/0
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          a.status === 'active' ? 'badge-success' :
                          a.status === 'full' ? 'badge-warning' :
                          a.status === 'suspended' || a.status === 'broken' ? 'badge-danger' :
                          'badge-neutral'
                        }`}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select
                            className="form-select"
                            value={a.status}
                            style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto', minWidth: '90px' }}
                            onChange={async (e) => {
                              const result = await adminUpdate('stock_accounts', { status: e.target.value, updated_at: new Date().toISOString() }, { id: a.id });
                              if (result.error) { alert('Gagal mengubah status: ' + result.error.message); return; }
                              loadData();
                            }}
                          >
                            <option value="active">Active</option>
                            <option value="full">Full</option>
                            <option value="inactive">Inactive</option>
                            <option value="suspended">Suspended</option>
                            <option value="broken">Broken</option>
                            <option value="expired">Expired</option>
                          </select>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setEditItem(a); setIsCopy(false); setShowForm(true); }}>Edit</button>
                          <button className="btn btn-info btn-sm" onClick={() => { setEditItem(a); setIsCopy(true); setShowForm(true); }}>Duplikat</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => loadBuyers(a.id)}>Buyers</button>
                          <button className="btn btn-secondary btn-sm" style={{ color: '#ef4444' }} onClick={() => handleDelete(a.id)}>Hapus</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedAccounts.length === 0 && (
                    <tr><td colSpan={9} className="empty-state"><div className="icon">🔑</div><h3>{searchQuery || filterProduct !== 'all' || filterStatus !== 'all' ? 'Tidak ada hasil yang cocok' : 'Belum ada stok akun'}</h3></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: '8px', marginTop: '20px', flexWrap: 'wrap',
              }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  style={{ fontSize: '0.8rem' }}
                >
                  «
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={{ fontSize: '0.8rem' }}
                >
                  ‹ Prev
                </button>

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    // Show first, last, and pages around current
                    if (page === 1 || page === totalPages) return true;
                    if (Math.abs(page - currentPage) <= 2) return true;
                    return false;
                  })
                  .map((page, idx, arr) => {
                    const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <span key={page}>
                        {showEllipsis && <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>…</span>}
                        <button
                          className={`btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setCurrentPage(page)}
                          style={{ fontSize: '0.8rem', minWidth: '36px' }}
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}

                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={{ fontSize: '0.8rem' }}
                >
                  Next ›
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  style={{ fontSize: '0.8rem' }}
                >
                  »
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <StockAccountForm
          account={editItem}
          isCopy={isCopy}
          products={products}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); loadData(); }}
        />
      )}

      {showBuyers !== null && (
        <div className="modal-overlay" onClick={() => setShowBuyers(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Buyers Menggunakan Akun #{showBuyers}</h3>
            {buyers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Tidak ada buyer aktif</p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead><tr><th>Buyer</th><th>Status</th><th>Mulai</th><th>Expired</th></tr></thead>
                  <tbody>
                    {buyers.map(b => (
                      <tr key={b.id}>
                        <td style={{ color: 'var(--text-primary)' }}>{b.buyer_name}</td>
                        <td><span className="badge badge-success">{b.status}</span></td>
                        <td>{new Date(b.start_at).toLocaleDateString('id-ID')}</td>
                        <td>{new Date(b.expired_at).toLocaleDateString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowBuyers(null)}>Tutup</button></div>
          </div>
        </div>
      )}

      {showBulk && (
        <BulkImportModal
          products={products}
          onClose={() => setShowBulk(false)}
          onDone={() => { setShowBulk(false); loadData(); }}
        />
      )}
    </div>
  );
}

function StockAccountForm({ account, isCopy, products, onClose, onSave }: {
  account: StockAccount | null;
  isCopy?: boolean;
  products: Product[];
  onClose: () => void;
  onSave: () => void;
}) {
  const isEdit = account && !isCopy;
  const [form, setForm] = useState({
    product_id: account?.product_id?.toString() || '',
    account_identifier: isCopy ? '' : (account?.account_identifier || ''),
    account_secret: '',
    two_factor_secret: '',
    profile_info: account?.profile_info || '',
    pin_info: account?.pin_info || '',
    notes_internal: account?.notes_internal || '',
    purchase_cost: account?.purchase_cost?.toString() || '',
    current_used_slot: isEdit ? (account?.current_used_slot?.toString() || '0') : '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPasswordStr, setShowPasswordStr] = useState<string | null>(null);
  const [fetchingPassword, setFetchingPassword] = useState(false);

  const selectedProduct = products.find(p => p.id.toString() === form.product_id);
  const identifierIsUrl = isHttpUrl(form.account_identifier);

  async function handleShowPassword() {
    if (!account?.id) return;
    setFetchingPassword(true);
    try {
      const res = await fetch(`/api/admin/stock-accounts/decrypt?id=${account.id}`, {
        headers: getAdminAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setShowPasswordStr(data.secret);
        setTimeout(() => setShowPasswordStr(null), 10000);
      } else {
        alert('Gagal mengambil sandi: ' + data.error);
      }
    } catch {
      alert('Terjadi kesalahan koneksi');
    } finally {
      setFetchingPassword(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/admin/stock-accounts', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
        body: JSON.stringify({
          id: isEdit ? account?.id : undefined,
          product_id: parseInt(form.product_id),
          account_identifier: form.account_identifier.trim(),
          account_secret: form.account_secret || (!isEdit && identifierIsUrl ? '-' : undefined),
          two_factor_secret: form.two_factor_secret || undefined,
          profile_info: form.profile_info || null,
          pin_info: form.pin_info || null,
          notes_internal: form.notes_internal || null,
          purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
          account_type: selectedProduct?.account_type || 'sharing',
          max_slot: selectedProduct?.default_max_slot || 4,
          current_used_slot: isEdit ? parseInt(form.current_used_slot) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setSaving(false); return; }
      onSave();
    } catch {
      setError('Terjadi kesalahan');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{isCopy ? '📋 Duplikat Stok Akun' : (account ? 'Edit Stok Akun' : 'Tambah Stok Akun')}</h3>
        {isCopy && (
          <div style={{ padding: '12px 16px', background: 'rgba(37,211,102,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(37,211,102,0.2)', marginBottom: '16px' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--brand-success)', margin: 0 }}>📋 Data produk, profil, PIN & catatan sudah tercopy. Isi email/username & password baru lalu simpan.</p>
          </div>
        )}
        {error && <div className="login-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Produk</label>
            <select className="form-select" value={form.product_id} onChange={e => setForm({...form, product_id: e.target.value})} required>
              <option value="">Pilih produk...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.account_type})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Email / Username / Link Aktivasi</label>
            <input className="form-input" value={form.account_identifier} onChange={e => setForm({...form, account_identifier: e.target.value})} placeholder="user@email.com atau https://serviceactivation.google.com/..." required />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Password Akun {isEdit ? '(kosongkan jika tidak diubah)' : (identifierIsUrl ? '(otomatis untuk link)' : '')}</span>
              {isEdit && (
                <button 
                  type="button" 
                  onClick={handleShowPassword} 
                  disabled={fetchingPassword}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                >
                  {fetchingPassword ? '⏳ Mengambil...' : '👁️ Lihat Sandi Asli'}
                </button>
              )}
            </label>
            <input 
              className="form-input" 
              value={showPasswordStr !== null ? showPasswordStr : form.account_secret} 
              onChange={e => {
                if (showPasswordStr !== null) setShowPasswordStr(null);
                setForm({...form, account_secret: e.target.value});
              }} 
              placeholder={showPasswordStr !== null ? '' : (isEdit ? '••••••••' : (identifierIsUrl ? 'Tidak perlu diisi untuk link' : 'Password Akun'))} 
              required={!isEdit && !identifierIsUrl} 
            />
            {showPasswordStr !== null && (
              <p style={{ fontSize: '0.75rem', color: 'var(--brand-warning)', marginTop: '4px', marginBottom: 0 }}>
                ⚠️ Sandi asli sedang ditampilkan. Akan disembunyikan dalam 10 detik.
              </p>
            )}
          </div>
          {supportsTwoFactorLive(selectedProduct) && (
            <div className="form-group">
              <label className="form-label">Kode 2FA.live <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(opsional)</span></label>
              <input className="form-input" value={form.two_factor_secret} onChange={e => setForm({ ...form, two_factor_secret: e.target.value })} placeholder="Contoh: 2KNEXO3CKMAWFJ4XNMOGMQD6WASDE3ED" />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '4px', display: 'block' }}>Kode disimpan terenkripsi dan dibagikan ke pembeli bersama email serta sandi.</small>
            </div>
          )}
          <div style={{ padding: '12px 16px', background: 'rgba(108,92,231,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', marginBottom: '16px' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>💡 Kolom profil & PIN bersifat <strong style={{ color: 'var(--text-secondary)' }}>opsional</strong>.</p>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nama Profil <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(opsional)</span></label>
              <input className="form-input" value={form.profile_info} onChange={e => setForm({...form, profile_info: e.target.value})} placeholder="Contoh: Profile 1" />
            </div>
            <div className="form-group">
              <label className="form-label">PIN <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(opsional)</span></label>
              <input className="form-input" value={form.pin_info} onChange={e => setForm({...form, pin_info: e.target.value})} placeholder="Contoh: 1234" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Harga Beli</label>
              <input type="number" className="form-input" value={form.purchase_cost} onChange={e => setForm({...form, purchase_cost: e.target.value})} placeholder="25000" />
            </div>
            {isEdit && (
              <div className="form-group">
                <label className="form-label">Slot Terpakai (Usage)</label>
                <input type="number" className="form-input" value={form.current_used_slot} onChange={e => setForm({...form, current_used_slot: e.target.value})} min="0" />
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Catatan Internal</label>
            <textarea className="form-textarea" value={form.notes_internal} onChange={e => setForm({...form, notes_internal: e.target.value})} placeholder="Catatan..." />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="loading-spinner" /> : (isEdit ? 'Simpan' : (isCopy ? '📋 Simpan Duplikat' : 'Tambah'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===================== BULK IMPORT MODAL =====================
function BulkImportModal({ products, onClose, onDone }: {
  products: Product[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const selectedProduct = products.find(p => p.id.toString() === productId);

  // Helper: detect if a line (after cleaning) is a URL/invite link
  function cleanLine(raw: string): string {
    // Strip leading numbering like "1. ", "2) ", "3- ", "1: ", etc.
    return raw.replace(/^\s*\d+[\.\)\-\:]\s*/, '').trim();
  }

  function isUrlLine(line: string): boolean {
    const cleaned = cleanLine(line);
    return /^https?:\/\//i.test(cleaned);
  }

  // Count detected lines
  const detectedLines = bulkText.trim().split('\n').filter(l => l.trim() && !/^[|*_\-\s]+$/.test(l.trim()));
  const urlLineCount = detectedLines.filter(l => isUrlLine(l)).length;
  const pipeLineCount = detectedLines.filter(l => !isUrlLine(l) && l.trim()).length;

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !bulkText.trim()) return;
    setImporting(true);
    setResult(null);

    const lines = bulkText.trim().split('\n').filter(l => l.trim() && !/^[|*_\-\s]+$/.test(l.trim()));
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();

      let identifier = '';
      let secret = '';
      let profile: string | null = null;
      let pin: string | null = null;
      let twoFactorSecret: string | null = null;

      if (isUrlLine(rawLine)) {
        // URL/invite link format
        identifier = cleanLine(rawLine);
        secret = '-'; // placeholder for invite links
      } else {
        // ChatGPT format: email|password|kode 2FA.live|profil|pin.
        // Other products retain the existing format: email|password|profil|pin.
        const parts = rawLine.split('|').map(p => p.trim());

        if (parts.length < 2) {
          errors.push(`Baris ${i + 1}: "${rawLine}" — Format salah (minimal: email|password atau link invite)`);
          failed++;
          continue;
        }

        identifier = parts[0];
        secret = parts[1];
        if (supportsTwoFactorLive(selectedProduct)) {
          twoFactorSecret = parts[2] || null;
          profile = parts[3] || null;
          pin = parts[4] || null;
        } else {
          profile = parts[2] || null;
          pin = parts[3] || null;
        }
      }

      try {
        const res = await fetch('/api/admin/stock-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify({
            product_id: parseInt(productId),
            account_identifier: identifier,
            account_secret: secret,
            two_factor_secret: twoFactorSecret,
            profile_info: profile,
            pin_info: pin,
            account_type: selectedProduct?.account_type || 'sharing',
            max_slot: selectedProduct?.default_max_slot || 4,
            purchase_cost: purchaseCost ? parseFloat(purchaseCost) : null,
          }),
        });
        if (res.ok) {
          success++;
        } else {
          const data = await res.json();
          errors.push(`Baris ${i + 1}: ${data.error || 'Gagal'}`);
          failed++;
        }
      } catch {
        errors.push(`Baris ${i + 1}: Kesalahan jaringan`);
        failed++;
      }
    }

    setResult({ success, failed, errors });
    setImporting(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
        <h3 className="modal-title">📥 Import Massal Stok Akun</h3>

        {result ? (
          <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--radius-md)', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-success)' }}>{result.success}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>BERHASIL</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--brand-danger)' }}>{result.failed}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>GAGAL</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px', maxHeight: '150px', overflowY: 'auto', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--brand-danger)' }}>
                {result.errors.map((err, i) => <div key={i}>{err}</div>)}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Tutup</button>
              <button className="btn btn-primary" onClick={onDone}>Selesai ✓</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleBulkImport}>
            <div className="form-group">
              <label className="form-label">Pilih Produk</label>
              <select className="form-select" required value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="">Pilih produk tujuan...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.account_type})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Harga Beli per Akun (Rp)</label>
              <input
                type="number"
                className="form-input"
                placeholder="Contoh: 25000"
                value={purchaseCost}
                onChange={e => setPurchaseCost(e.target.value)}
                min={0}
              />
            </div>

            <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.06)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.15)', marginBottom: '16px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--accent)', margin: '0 0 8px', fontWeight: 700 }}>📌 Format yang didukung:</p>
              {/* Format 1: pipe-delimited */}
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Format 1 — ChatGPT dengan Kode 2FA.live:</span>
                <code style={{ fontSize: '0.78rem', color: 'var(--text-primary)', background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '6px', display: 'block', marginTop: '4px' }}>
                  email|password|kode-2fa.live|profil(opsional)|pin(opsional)
                </code>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>Pada produk selain ChatGPT, format tetap: email|password|profil(opsional)|pin(opsional).</span>
              </div>
              {/* Format 2: invite link */}
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Format 2 — Link Invite (per baris):</span>
                <code style={{ fontSize: '0.78rem', color: 'var(--text-primary)', background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '6px', display: 'block', marginTop: '4px' }}>
                  https://serviceactivation.google.com/subscription/new/...
                </code>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '8px 0 0', fontStyle: 'italic' }}>
                💡 Bisa dicampur! Baris kosong dan pemisah | diabaikan; nomor urut otomatis dihapus.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">
                Paste Data Akun ({detectedLines.length} baris terdeteksi
                {detectedLines.length > 0 && (urlLineCount > 0 || pipeLineCount > 0) && (
                  <span style={{ fontWeight: 400, textTransform: 'none' }}>
                    {' '}— {urlLineCount > 0 && <span style={{ color: '#8b5cf6' }}>🔗 {urlLineCount} link</span>}
                    {urlLineCount > 0 && pipeLineCount > 0 && ', '}
                    {pipeLineCount > 0 && <span style={{ color: '#3b82f6' }}>📧 {pipeLineCount} akun</span>}
                  </span>
                )}
                )
              </label>
              <textarea
                className="form-textarea"
                style={{ minHeight: '180px', fontFamily: 'monospace', fontSize: '0.82rem' }}
                required
                placeholder={'gpt@example.com|password123|2KNEXO3CKMAWFJ4XNMOGMQD6WASDE3ED\nemail2@gmail.com|password456|Profile 1|1234\nhttps://www.canva.com/brand/join?token=abc123\n1. https://www.canva.com/brand/join?token=def456\n2. https://www.canva.com/brand/join?token=ghi789'}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
              />
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={importing || !productId || !bulkText.trim()}>
                {importing ? (
                  <><span className="loading-spinner" /> Mengimpor...</>
                ) : (
                  `🚀 Import ${detectedLines.length} Akun`
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
