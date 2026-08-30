'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type RefundStatus = 'pending' | 'reviewing' | 'approved' | 'processing' | 'completed' | 'rejected';

interface RefundRow {
  id: number;
  request_code: string;
  refund_amount: number;
  ewallet_provider: 'dana' | 'gopay';
  ewallet_number: string;
  account_holder_name: string;
  status: RefundStatus;
  admin_notes: string | null;
  created_at: string;
  processed_at: string | null;
  orders: {
    order_number: string;
    buyer: { name?: string | null; email?: string | null; phone?: string | null } | null;
    product: { name?: string | null; code?: string | null } | null;
  } | null;
}

const STATUS_OPTIONS: Array<{ id: RefundStatus; label: string; color: string; bg: string }> = [
  { id: 'pending', label: 'Menunggu', color: '#b45309', bg: '#fff7ed' },
  { id: 'reviewing', label: 'Ditinjau', color: '#1d4ed8', bg: '#eff6ff' },
  { id: 'approved', label: 'Disetujui', color: '#047857', bg: '#ecfdf5' },
  { id: 'processing', label: 'Diproses', color: '#6d28d9', bg: '#f5f3ff' },
  { id: 'completed', label: 'Selesai', color: '#15803d', bg: '#f0fdf4' },
  { id: 'rejected', label: 'Ditolak', color: '#b91c1c', bg: '#fef2f2' },
];

function getAdminHeaders(includeJson = false): HeadersInit {
  const token = typeof window === 'undefined' ? '' : localStorage.getItem('admin_token') || '';
  return { ...(includeJson ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` };
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0);
}

function StatusBadge({ status }: { status: RefundStatus }) {
  const item = STATUS_OPTIONS.find((option) => option.id === status) || STATUS_OPTIONS[0];
  return (
    <span style={{ color: item.color, background: item.bg, padding: '5px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 750, whiteSpace: 'nowrap' }}>
      {item.label}
    </span>
  );
}

export default function AdminRefundsPage() {
  const [requests, setRequests] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<'all' | RefundStatus>('all');
  const [selected, setSelected] = useState<RefundRow | null>(null);
  const [status, setStatus] = useState<RefundStatus>('pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/admin/refunds', { headers: getAdminHeaders(), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setRequests([]);
        setLoadError(data.error || 'Gagal memuat pengajuan refund.');
        return;
      }
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
      setLoadError('Gagal menghubungi server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const stats = useMemo(() => Object.fromEntries(
    STATUS_OPTIONS.map((option) => [option.id, requests.filter((item) => item.status === option.id).length]),
  ) as Record<RefundStatus, number>, [requests]);

  const filteredRequests = useMemo(
    () => filter === 'all' ? requests : requests.filter((item) => item.status === filter),
    [filter, requests],
  );

  function openDetail(item: RefundRow) {
    setSelected(item);
    setStatus(item.status);
    setAdminNotes(item.admin_notes || '');
    setUpdateError('');
  }

  async function handleSetupDatabase() {
    setMigrating(true);
    setLoadError('');
    try {
      const response = await fetch('/api/admin/refunds', {
        method: 'POST',
        headers: getAdminHeaders(true),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoadError(data.error || 'Database refund belum dapat disiapkan.');
        return;
      }
      await loadRequests();
    } catch {
      setLoadError('Gagal menghubungi server saat menyiapkan database refund.');
    } finally {
      setMigrating(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setUpdateError('');
    try {
      const response = await fetch('/api/admin/refunds', {
        method: 'PUT',
        headers: getAdminHeaders(true),
        body: JSON.stringify({ id: selected.id, status, admin_notes: adminNotes }),
      });
      const data = await response.json();
      if (!response.ok) {
        setUpdateError(data.error || 'Gagal memperbarui refund.');
        return;
      }
      setSelected(null);
      await loadRequests();
    } catch {
      setUpdateError('Gagal menghubungi server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <div>
          <h2>💸 Pengajuan Refund</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>Kelola pengembalian dana DANA dan GoPay secara terpisah dari garansi.</p>
        </div>
        <button type="button" onClick={() => void loadRequests()} className="btn btn-secondary">🔄 Refresh</button>
      </div>

      <div style={{ padding: '32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '12px', marginBottom: '22px' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.45rem', fontWeight: 800 }}>{requests.length}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Total</div>
          </div>
          {STATUS_OPTIONS.map((item) => (
            <div key={item.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: item.color }}>{stats[item.id] || 0}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{item.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '18px', padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-lg)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>Filter:</span>
          {(['all', ...STATUS_OPTIONS.map((item) => item.id)] as Array<'all' | RefundStatus>).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              style={{ padding: '5px 11px', borderRadius: '999px', border: '1px solid var(--border-secondary)', background: filter === item ? 'var(--accent)' : 'transparent', color: filter === item ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 650 }}
            >
              {item === 'all' ? 'Semua' : STATUS_OPTIONS.find((option) => option.id === item)?.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.76rem' }}>{filteredRequests.length} pengajuan</span>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Waktu</th><th>Kode</th><th>Pesanan & Buyer</th><th>Produk</th><th>Tujuan Refund</th><th>Nominal</th><th>Status</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="empty-state"><div className="loading-spinner" /></td></tr>
              ) : loadError ? (
                <tr><td colSpan={8} className="empty-state"><h3>Database refund belum siap</h3><p>{loadError}</p><div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}><button type="button" className="btn btn-primary btn-sm" disabled={migrating} onClick={() => void handleSetupDatabase()}>{migrating ? 'Menyiapkan...' : 'Siapkan Database Refund'}</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadRequests()}>Coba Lagi</button></div></td></tr>
              ) : filteredRequests.length === 0 ? (
                <tr><td colSpan={8} className="empty-state"><div className="icon">💸</div><h3>Belum ada pengajuan refund</h3></td></tr>
              ) : filteredRequests.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(item.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{item.request_code}</td>
                  <td>
                    <strong style={{ display: 'block', fontFamily: 'monospace', fontSize: '0.78rem' }}>{item.orders?.order_number || '-'}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{item.orders?.buyer?.name || 'Buyer tidak dikenal'}</span>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{item.orders?.product?.name || '-'}</td>
                  <td>
                    <strong style={{ display: 'block', fontSize: '0.78rem', textTransform: 'uppercase' }}>{item.ewallet_provider}</strong>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.76rem' }}>{item.ewallet_number}</span>
                    <small style={{ display: 'block', color: 'var(--text-muted)' }}>a.n. {item.account_holder_name}</small>
                  </td>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatRupiah(item.refund_amount)}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(item)}>Detail</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '610px' }}>
            <h3 className="modal-title">💸 Detail Pengajuan Refund</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', padding: '14px', marginBottom: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.83rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Kode:</span><br /><strong style={{ fontFamily: 'monospace' }}>{selected.request_code}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Order:</span><br /><strong>{selected.orders?.order_number || '-'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Buyer:</span><br />{selected.orders?.buyer?.name || '-'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>WhatsApp:</span><br />{selected.orders?.buyer?.phone || '-'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Produk:</span><br />{selected.orders?.product?.name || '-'}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Nominal:</span><br /><strong>{formatRupiah(selected.refund_amount)}</strong></div>
            </div>

            <div style={{ padding: '14px', marginBottom: '18px', border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: 'var(--radius-md)', background: 'rgba(37, 99, 235, 0.06)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>Tujuan Pengiriman Dana</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div><strong style={{ textTransform: 'uppercase' }}>{selected.ewallet_provider}</strong><br /><span style={{ fontFamily: 'monospace' }}>{selected.ewallet_number}</span></div>
                <div style={{ textAlign: 'right' }}><span style={{ color: 'var(--text-muted)' }}>Atas nama</span><br /><strong>{selected.account_holder_name}</strong></div>
              </div>
            </div>

            <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="refund-status">Status Refund</label>
                <select id="refund-status" className="form-select" value={status} onChange={(event) => setStatus(event.target.value as RefundStatus)}>
                  {STATUS_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '5px' }}>Pilih Selesai hanya setelah dana benar-benar dikirim.</p>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="refund-admin-notes">Catatan Admin</label>
                <textarea id="refund-admin-notes" className="form-textarea" rows={3} maxLength={2000} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} placeholder="Contoh: Diverifikasi, menunggu transfer tanggal..." />
              </div>
              {updateError && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{updateError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>Tutup</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Status'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
