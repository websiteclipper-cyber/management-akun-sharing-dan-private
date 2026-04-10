'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { adminUpdate, adminInsert, adminDelete } from '@/lib/adminApi';

interface Reseller {
  id: string;
  name: string;
  phone: string;
  ref_code: string;
  pin?: string;
  default_commission_type: 'fixed' | 'percentage';
  default_commission_value: number;
  status: string;
  total_sales: number;
  total_commission: number;
  unpaid_commission: number;
  created_at: string;
}

interface Commission {
  id: string;
  reseller_id: string;
  order_id: string;
  product_id?: number;
  product_name?: string;
  order_amount?: number;
  commission_type: 'fixed' | 'percentage';
  commission_rate: number;
  commission_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  order?: { order_number: string; total_amount: number; buyer: { name: string } };
  reseller?: { name: string; ref_code: string };
}

interface Product {
  id: number;
  name: string;
  price: number;
}

interface ResellerProductCommission {
  id?: string;
  reseller_id: string;
  product_id: number;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
}

export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productCommissions, setProductCommissions] = useState<Record<number, ResellerProductCommission | null>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(null);
  const [tab, setTab] = useState<'resellers' | 'commissions' | 'product-commissions'>('resellers');
  const [copied, setCopied] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    ref_code: '',
    pin: '',
    default_commission_type: 'fixed' as 'fixed' | 'percentage',
    default_commission_value: 3000,
    status: 'active',
  });

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => { 
    loadResellers(); 
    loadProducts();
  }, []);

  async function loadProducts() {
    const { data } = await supabase.from('products').select('id, name, price').eq('status', 'active');
    if (data) setProducts(data);
  }

  async function loadResellers() {
    setLoading(true);
    const { data } = await supabase.from('resellers').select('*').order('created_at', { ascending: false });
    if (data) setResellers(data);
    setLoading(false);
  }

  async function loadCommissions(resellerId?: string) {
    setLoading(true);
    let query = supabase
      .from('reseller_commissions')
      .select('*, order:orders(order_number, total_amount, buyer:buyers(name)), reseller:resellers(name, ref_code)')
      .order('created_at', { ascending: false });

    if (resellerId) {
      query = query.eq('reseller_id', resellerId);
    }

    const { data } = await query;
    if (data) setCommissions(data as unknown as Commission[]);
    setLoading(false);
  }

  async function editProductCommissions(r: Reseller) {
    setSelectedReseller(r);
    setTab('product-commissions');
    setLoading(true);
    const { data } = await supabase.from('reseller_product_commissions').select('*').eq('reseller_id', r.id);
    const mapping: Record<number, ResellerProductCommission | null> = {};
    if (data) {
      data.forEach(item => {
        mapping[item.product_id] = item;
      });
    }
    setProductCommissions(mapping);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    let result;
    if (editingId) {
      const updatePayload: Record<string, any> = {
        name: form.name,
        phone: form.phone,
        default_commission_type: form.default_commission_type,
        default_commission_value: form.default_commission_value,
        status: form.status,
        updated_at: new Date().toISOString(),
      };
      if (form.pin) updatePayload.pin = form.pin;

      result = await adminUpdate('resellers', updatePayload, { id: editingId });
    } else {
      result = await adminInsert('resellers', {
        name: form.name,
        phone: form.phone,
        ref_code: form.ref_code.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        pin: form.pin || '123456',
        default_commission_type: form.default_commission_type,
        default_commission_value: form.default_commission_value,
        status: form.status,
      });
    }

    if (result.error) {
      alert('Gagal menyimpan: ' + result.error.message);
      return;
    }

    setForm({ name: '', phone: '', ref_code: '', pin: '', default_commission_type: 'fixed', default_commission_value: 3000, status: 'active' });
    setEditingId(null);
    setShowForm(false);
    loadResellers();
  }

  function handleEdit(r: Reseller) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      phone: r.phone || '',
      ref_code: r.ref_code,
      pin: r.pin || '',
      default_commission_type: r.default_commission_type || 'fixed',
      default_commission_value: r.default_commission_value || 0,
      status: r.status,
    });
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus reseller ini? Semua data komisinya juga akan terhapus.')) return;
    
    // Trik hapus foreign key (manual cleanup) jika ON DELETE CASCADE tidak aktif
    const oRes = await adminUpdate('orders', { reseller_id: null }, { reseller_id: id });
    if (oRes.error) { alert('DB Update Orders failed: ' + JSON.stringify(oRes.error)); return; }

    const rcRes = await adminDelete('reseller_commissions', { reseller_id: id });
    if (rcRes.error) { alert('DB Delete RC failed: ' + JSON.stringify(rcRes.error)); return; }

    const rpcRes = await adminDelete('reseller_product_commissions', { reseller_id: id });
    if (rpcRes.error) { alert('DB Delete RPC failed: ' + JSON.stringify(rpcRes.error)); return; }

    const result = await adminDelete('resellers', { id });
    if (result.error) { alert('Gagal menghapus Reseller: ' + JSON.stringify(result.error)); return; }
    loadResellers();
  }

  async function handlePayAll(reseller: Reseller) {
    if (!confirm(`Tandai semua komisi ${reseller.name} (${formatPrice(reseller.unpaid_commission)}) sebagai SUDAH DIBAYAR?`)) return;

    const r1 = await adminUpdate('reseller_commissions', { status: 'paid', paid_at: new Date().toISOString() }, { reseller_id: reseller.id, status: 'unpaid' });
    if (r1.error) { alert('Gagal update komisi: ' + r1.error.message); return; }

    const r2 = await adminUpdate('resellers', {
      unpaid_commission: 0,
      updated_at: new Date().toISOString(),
    }, { id: reseller.id });
    if (r2.error) { alert('Gagal update reseller: ' + r2.error.message); return; }

    loadResellers();
    if (selectedReseller?.id === reseller.id) loadCommissions(reseller.id);
    alert(`Komisi ${reseller.name} berhasil ditandai lunas!`);
  }

  function copyLink(refCode: string) {
    navigator.clipboard.writeText(`${siteUrl}/?ref=${refCode}`);
    setCopied(refCode);
    setTimeout(() => setCopied(null), 2000);
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  }

  function formatCommission(type: string, value: number) {
    if (type === 'percentage') return `${value}%`;
    return formatPrice(value);
  }

  function viewCommissions(r: Reseller) {
    setSelectedReseller(r);
    setTab('commissions');
    loadCommissions(r.id);
  }

  const totalUnpaid = resellers.reduce((sum, r) => sum + r.unpaid_commission, 0);
  const totalPaid = resellers.reduce((sum, r) => sum + (r.total_commission - r.unpaid_commission), 0);
  const pendingCount = resellers.filter(r => r.status === 'pending').length;
  const MIN_WITHDRAW = 50000;

  async function handleApprove(r: Reseller) {
    if (!confirm(`Setujui ${r.name} sebagai mitra aktif?`)) return;
    const result = await adminUpdate('resellers', { status: 'active', updated_at: new Date().toISOString() }, { id: r.id });
    if (result.error) { alert('Gagal Setujui: ' + JSON.stringify(result.error)); return; }
    loadResellers();
  }

  async function handleApplyToAll(productId: number, pName: string, cType: string, cVal: number) {
    if (!confirm(`Konfirmasi: Terapkan komisi ${formatCommission(cType, cVal)} untuk produk "${pName}" ke SELURUH reseller yang aktif?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/commissions/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify({
          productId: productId,
          commissionType: cType,
          commissionValue: cVal
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menerapkan ke semua');
      
      alert(`Berhasil diterapkan ke ${json.count} reseller aktif!`);
      if (selectedReseller) editProductCommissions(selectedReseller);
    } catch (err: any) {
      alert(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Reseller / Mitra</h1>
          <p style={{ color: 'var(--text-muted)' }}>Kelola karyawan freelance & komisi penjualan mereka.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', phone: '', ref_code: '', pin: '', default_commission_type: 'fixed', default_commission_value: 3000, status: 'active' }); }}>
          {showForm ? 'Tutup Form' : '+ Tambah Reseller'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-label">TOTAL RESELLER</div>
          <div className="stat-value">{resellers.filter(r => r.status === 'active').length}</div>
          <div className="stat-icon">🤝</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TOTAL PENJUALAN</div>
          <div className="stat-value">{resellers.reduce((s, r) => s + r.total_sales, 0)}</div>
          <div className="stat-icon">🛒</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">KOMISI BELUM DIBAYAR</div>
          <div className="stat-value" style={{ color: totalUnpaid > 0 ? '#eab308' : 'var(--brand-success)' }}>{formatPrice(totalUnpaid)}</div>
          <div className="stat-icon">💸</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">TOTAL SUDAH DIBAYAR</div>
          <div className="stat-value" style={{ color: 'var(--brand-success)' }}>{formatPrice(totalPaid)}</div>
          <div className="stat-icon">✅</div>
        </div>
        {pendingCount > 0 && (
          <div className="stat-card" style={{ border: '1px solid rgba(234,179,8,0.3)' }}>
            <div className="stat-label">MENUNGGU APPROVAL</div>
            <div className="stat-value" style={{ color: '#eab308' }}>{pendingCount}</div>
            <div className="stat-icon">⏳</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button className={`btn btn-sm ${tab === 'resellers' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('resellers'); setSelectedReseller(null); }}>
          Daftar Reseller ({resellers.length})
        </button>
        <button className={`btn btn-sm ${tab === 'commissions' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setTab('commissions'); loadCommissions(); setSelectedReseller(null); }}>
          Riwayat Komisi
        </button>
      </div>

      {/* ADD/EDIT FORM */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px' }}>{editingId ? 'Edit Reseller' : 'Tambah Reseller Baru'}</h2>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nama Reseller</label>
                <input required className="form-input" placeholder="Contoh: Andi" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">No. WhatsApp</label>
                <input className="form-input" placeholder="08123456789" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Kode Referral (Unik)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <input
                      required={!editingId}
                      disabled={!!editingId}
                      className="form-input"
                      placeholder="Contoh: ANDI"
                      value={form.ref_code}
                      onChange={e => setForm({ ...form, ref_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                      style={{ width: '100%', ...(editingId ? { opacity: 0.5 } : {}) }}
                    />
                  </div>
                  <div>
                    <input
                      className="form-input"
                      placeholder="PIN (Default: 123456)"
                      value={form.pin}
                      onChange={e => setForm({ ...form, pin: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                {!editingId && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Huruf besar & angka saja. Ini akan jadi link unik reseller.</p>}
                {editingId && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Anda dapat melihat atau mengubah PIN reseller ini.</p>}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tipe Default Komisi</label>
                  <select className="form-input" value={form.default_commission_type} onChange={e => setForm({ ...form, default_commission_type: e.target.value as 'fixed' | 'percentage' })}>
                    <option value="fixed">Fixed (Rp)</option>
                    <option value="percentage">Persentase (%)</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Nilai Default Komisi</label>
                  <input required type="number" className="form-input" min={0} value={form.default_commission_value} onChange={e => setForm({ ...form, default_commission_value: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary">{editingId ? 'Simpan Perubahan' : 'Tambahkan'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>Batal</button>
            </div>
          </form>
        </div>
      )}

      {/* RESELLERS TAB */}
      {tab === 'resellers' && (
        loading ? <div className="loading-page"><div className="loading-spinner" /></div> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Kode Ref</th>
                  <th>Penjualan</th>
                  <th>Belum Dibayar</th>
                  <th>Sudah Dibayar</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {resellers.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.phone || '-'}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>{r.ref_code}</code>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => copyLink(r.ref_code)}>
                          {copied === r.ref_code ? '✅' : '📋'}
                        </button>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.total_sales}</td>
                    <td style={{ minWidth: '150px' }}>
                      <div style={{ fontWeight: 700, color: r.unpaid_commission > 0 ? '#eab308' : 'var(--text-muted)', marginBottom: '6px' }}>
                        {formatPrice(r.unpaid_commission)}
                      </div>
                      {r.unpaid_commission > 0 && (
                        <div>
                          <div style={{
                            width: '100%', height: '6px', borderRadius: '3px',
                            background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${Math.min((r.unpaid_commission / MIN_WITHDRAW) * 100, 100)}%`,
                              height: '100%', borderRadius: '3px',
                              background: r.unpaid_commission >= MIN_WITHDRAW
                                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                                : 'linear-gradient(90deg, #eab308, #f59e0b)',
                              transition: 'width 0.5s ease'
                            }} />
                          </div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {r.unpaid_commission >= MIN_WITHDRAW
                              ? '✅ Bisa dicairkan'
                              : `${Math.round((r.unpaid_commission / MIN_WITHDRAW) * 100)}% dari ${formatPrice(MIN_WITHDRAW)}`}
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--brand-success)' }}>
                      {formatPrice(r.total_commission - r.unpaid_commission)}
                    </td>
                    <td>
                      <span className={`badge ${r.status === 'active' ? 'badge-success' : r.status === 'pending' ? 'badge-warning' : 'badge-danger'}`} style={r.status === 'pending' ? { background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' } : {}}>{r.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {r.status === 'pending' && (
                          <button className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600 }} onClick={() => handleApprove(r)}>✅ Setujui</button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => editProductCommissions(r)} title="Atur Komisi">⚙️ Komisi</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => viewCommissions(r)} title="Riwayat Komisi">📊 Riwayat</button>
                        {r.unpaid_commission > 0 && (
                          <button className="btn btn-sm" style={{ background: '#22c55e', color: '#fff', border: 'none', fontWeight: 600 }} onClick={() => handlePayAll(r)} title="Bayar Lunas">
                            💰 Bayar
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(r)} title="Edit Reseller" style={{ padding: '6px 8px' }}>✏️</button>
                        <button className="btn btn-secondary btn-sm" style={{ color: '#ef4444', padding: '6px 8px' }} onClick={() => handleDelete(r.id)} title="Hapus">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {resellers.length === 0 && (
                  <tr><td colSpan={7} className="empty-state"><div className="icon">🤝</div><h3>Belum ada reseller</h3><p>Klik &quot;+ Tambah Reseller&quot; untuk memulai.</p></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* PRODUCT COMMISSIONS TAB */}
      {tab === 'product-commissions' && selectedReseller && (
        loading ? <div className="loading-page"><div className="loading-spinner" /></div> : (
          <div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Atur Komisi Per Produk: {selectedReseller.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Default Komisi: <strong style={{ color: 'var(--accent)' }}>{formatCommission(selectedReseller.default_commission_type || 'fixed', selectedReseller.default_commission_value || 0)}</strong>
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => { setTab('resellers'); loadResellers(); }}>Kembali</button>
            </div>
            
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produk</th>
                    <th>Harga</th>
                    <th>Tipe Komisi</th>
                    <th>Nilai Komisi</th>
                    <th>Hasil Akhir</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const customComm = productCommissions[p.id];
                    const isCustom = !!customComm;
                    const cType = customComm ? customComm.commission_type : (selectedReseller.default_commission_type || 'fixed');
                    const cVal = customComm ? customComm.commission_value : (selectedReseller.default_commission_value || 0);
                    const finalAmount = cType === 'percentage' ? Math.round(p.price * cVal / 100) : cVal;
                    
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{formatPrice(p.price)}</td>
                        <td>
                          <select 
                            className="form-input" 
                            style={{ padding: '6px', fontSize: '0.8rem', height: 'auto' }}
                            value={isCustom ? cType : 'default'}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (val === 'default') {
                                if (customComm?.id) {
                                  const res = await adminDelete('reseller_product_commissions', { id: customComm.id });
                                  if (res.error) { alert('Gagal menghapus: ' + res.error.message); return; }
                                }
                                setProductCommissions(prev => ({ ...prev, [p.id]: null }));
                              } else {
                                const newVal = val as 'fixed' | 'percentage';
                                const valueToSet = customComm ? customComm.commission_value : 0;
                                if (customComm?.id) {
                                  const res = await adminUpdate('reseller_product_commissions', { commission_type: newVal }, { id: customComm.id });
                                  if (res.error) { alert('Gagal update tipe: ' + res.error.message); return; }
                                  setProductCommissions(prev => ({ ...prev, [p.id]: { ...customComm!, commission_type: newVal } }));
                                } else {
                                  const res = await adminInsert('reseller_product_commissions', { 
                                    reseller_id: selectedReseller.id, 
                                    product_id: p.id, 
                                    commission_type: newVal, 
                                    commission_value: valueToSet 
                                  });
                                  if (res.error) { alert('Gagal menyimpan: ' + res.error.message); return; }
                                  if (res.data?.[0]) setProductCommissions(prev => ({ ...prev, [p.id]: res.data[0] }));
                                }
                              }
                            }}
                          >
                            <option value="default">Ikuti Default</option>
                            <option value="fixed">Fixed (Rp)</option>
                            <option value="percentage">Persentase (%)</option>
                          </select>
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="form-input"
                            style={{ padding: '6px', fontSize: '0.8rem', height: 'auto', width: '100px' }}
                            disabled={!isCustom}
                            value={isCustom ? (customComm?.commission_value || 0) : (selectedReseller.default_commission_value || 0)}
                            onChange={async (e) => {
                              const val = parseInt(e.target.value) || 0;
                              if (customComm?.id) {
                                setProductCommissions(prev => ({ ...prev, [p.id]: { ...customComm!, commission_value: val } }));
                                const res = await adminUpdate('reseller_product_commissions', { commission_value: val }, { id: customComm.id });
                                if (res.error) {
                                  alert('Gagal update nilai: ' + res.error.message);
                                  setProductCommissions(prev => ({ ...prev, [p.id]: customComm }));
                                }
                              }
                            }}
                          />
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--brand-success)' }}>
                          {formatPrice(finalAmount)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isCustom ? <span className="badge badge-primary">Khusus</span> : <span className="badge badge-secondary">Default</span>}
                            {isCustom && (
                              <button 
                                className="btn btn-sm" 
                                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 600 }}
                                onClick={() => handleApplyToAll(p.id, p.name, cType, cVal)}
                                title="Set komisi ini ke SELURUH Reseller"
                              >
                                👥 Terapkan Semua
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* COMMISSIONS TAB */}
      {tab === 'commissions' && (
        loading ? <div className="loading-page"><div className="loading-spinner" /></div> : (
          <div>
            {selectedReseller && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Riwayat Komisi: {selectedReseller.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Kode: {selectedReseller.ref_code} — Default: <strong style={{ color: 'var(--accent)' }}>{formatCommission(selectedReseller.default_commission_type || 'fixed', selectedReseller.default_commission_value || 0)}</strong></div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedReseller(null); loadCommissions(); }}>Lihat Semua</button>
              </div>
            )}
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Mitra</th>
                    <th>Order & Pembeli</th>
                    <th>Produk</th>
                    <th>Harga & Rate</th>
                    <th>Komisi Akhir</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontSize: '0.8rem' }}>{new Date(c.created_at).toLocaleString('id-ID')}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.reseller?.name || '-'}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {c.reseller?.ref_code ? <code style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 6px', borderRadius: '3px', fontSize: '0.65rem' }}>{c.reseller.ref_code}</code> : '-'}
                        </div>
                      </td>
                      <td>
                        <div><code style={{ color: 'var(--accent)' }}>{c.order?.order_number || '-'}</code></div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{(c.order?.buyer as any)?.name || '-'}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.product_name || '-'}</td>
                      <td>
                        <div>{c.order_amount ? formatPrice(c.order_amount) : '-'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rate: {formatCommission(c.commission_type || 'fixed', c.commission_rate || 0)}</div>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--brand-success)' }}>{formatPrice(c.commission_amount)}</td>
                      <td>
                        <span className={`badge ${c.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                          {c.status === 'paid' ? '✅ Dibayar' : '⏳ Belum'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {commissions.length === 0 && (
                    <tr><td colSpan={7} className="empty-state"><div className="icon">📊</div><h3>Belum ada riwayat komisi</h3></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
