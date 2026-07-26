'use client';

import { useState, useEffect, useMemo } from 'react';

export default function AdminWarrantyClaims() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [updateData, setUpdateData] = useState({
    status: '', admin_notes: '', resolution_notes: '', new_email: ''
  });
  // Manual replace state
  const [availableBackups, setAvailableBackups] = useState<any[]>([]);
  const [selectedBackupId, setSelectedBackupId] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [replaceResult, setReplaceResult] = useState<any>(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [savingDecision, setSavingDecision] = useState(false);
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/warranty');
      const data = await res.json();
      setClaims(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;

    setSavingDecision(true);
    setUpdateError('');

    try {
      const decisionStatus = ['pending', 'approved', 'rejected'].includes(updateData.status)
        ? updateData.status
        : undefined;
      const res = await fetch('/api/admin/warranty', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedClaim.id,
          status: decisionStatus,
          admin_notes: updateData.admin_notes,
          resolution_notes: updateData.resolution_notes,
          new_email: updateData.new_email,
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setUpdateError(data.error || 'Gagal menyimpan keputusan klaim.');
        return;
      }

      setShowModal(false);
      await fetchClaims();
    } catch {
      setUpdateError('Gagal menghubungi server.');
    } finally {
      setSavingDecision(false);
    }
  };

  const fetchAvailableBackups = async (productId: string) => {
    setLoadingBackups(true);
    try {
      const res = await fetch(`/api/admin/warranty/manual-replace?product_id=${productId}`);
      const data = await res.json();
      setAvailableBackups(Array.isArray(data) ? data : []);
    } catch { setAvailableBackups([]); }
    setLoadingBackups(false);
  };

  const handleManualReplace = async () => {
    if (!selectedClaim || !selectedBackupId) return;
    setReplacing(true);
    setReplaceResult(null);
    try {
      const res = await fetch('/api/admin/warranty/manual-replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: selectedClaim.id,
          backup_account_id: selectedBackupId,
          admin_notes: updateData.admin_notes || 'Manual replace oleh admin',
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setReplaceResult({ error: data.error });
      } else {
        setReplaceResult(data);
        fetchClaims();
      }
    } catch (err: any) {
      setReplaceResult({ error: err.message || 'Gagal mengganti akun' });
    }
    setReplacing(false);
  };

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayClaims = claims.filter(c => new Date(c.created_at) >= today);
    
    return {
      total: claims.length,
      totalToday: todayClaims.length,
      pending: claims.filter(c => c.status === 'pending').length,
      approved: claims.filter(c => c.status === 'approved').length,
      rejected: claims.filter(c => c.status === 'rejected').length,
      completedLegacy: claims.filter(c => c.status === 'auto_replaced').length,
    };
  }, [claims]);

  // Filtered claims
  const filteredClaims = useMemo(() => {
    if (filterStatus === 'all') return claims;
    return claims.filter(c => c.status === filterStatus);
  }, [claims, filterStatus]);

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      pending:        { bg: 'rgba(234,179,8,0.15)',  text: '#eab308', label: '⏳ Menunggu Peninjauan' },
      approved:       { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e', label: '✅ Diterima' },
      rejected:       { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444', label: '❌ Ditolak' },
      auto_replaced:  { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e', label: '✅ Selesai (lama)' },
      no_backup:      { bg: 'rgba(249,115,22,0.15)', text: '#f97316', label: '⚠️ Status Lama: No Backup' },
      invalid_claim:  { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444', label: '❌ Status Lama: Invalid' },
      manual_review:  { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', label: '🔍 Status Lama: Review' },
    };
    const s = map[status] || { bg: 'rgba(113,113,122,0.15)', text: '#71717a', label: status };
    return (
      <span style={{
        background: s.bg, color: s.text,
        padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem',
        fontWeight: 600, whiteSpace: 'nowrap',
      }}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <h2>🛡️ Klaim Garansi</h2>
        <button onClick={fetchClaims} className="btn btn-secondary">
          🔄 Refresh
        </button>
      </div>

      <div style={{ padding: '32px' }}>
        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total Klaim', value: stats.total, color: 'var(--text-primary)', sub: `${stats.totalToday} hari ini` },
            { label: 'Menunggu', value: stats.pending, color: '#eab308' },
            { label: 'Diterima', value: stats.approved, color: '#22c55e' },
            { label: 'Ditolak', value: stats.rejected, color: '#ef4444' },
            { label: 'Selesai (Data Lama)', value: stats.completedLegacy, color: '#3b82f6' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
              {s.sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter Status:</span>
          {['all', 'pending', 'approved', 'rejected', 'auto_replaced'].map(s => (
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
              {s === 'all' ? 'Semua' :
               s === 'pending' ? 'Menunggu' :
               s === 'approved' ? 'Diterima' :
               s === 'rejected' ? 'Ditolak' : 'Selesai (Data Lama)'}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {filteredClaims.length} klaim
          </span>
        </div>

        {/* Table */}
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Kode Klaim</th>
                <th>Order & Pembeli</th>
                <th>Produk</th>
                <th>Email Dilaporkan</th>
                <th>Kendala</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="empty-state"><div className="loading-spinner" /></td></tr>
              ) : filteredClaims.length === 0 ? (
                <tr><td colSpan={8} className="empty-state"><div className="icon">🛡️</div><h3>Belum ada klaim garansi</h3></td></tr>
              ) : (
                filteredClaims.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(c.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                      {c.claim_code}
                    </td>
                    <td>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {c.orders?.order_number || `#${c.order_id}`}
                      </div>
                      {c.orders?.buyer_email && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div>👤 {c.orders.buyer_email.name || 'Tanpa Nama'}</div>
                          <div>📱 {c.orders.buyer_email.phone || '-'}</div>
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {c.products?.name || '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {c.reported_email}
                    </td>
                    <td style={{ fontSize: '0.8rem', maxWidth: '200px' }}>
                      <span title={c.reason || c.issue_description || '-'} style={{ 
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' 
                      }}>
                        {c.issue_type ? (
                          <span style={{ 
                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                            background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                          }}>
                            {c.issue_type === 'password_changed' ? '🔐 Password' :
                             c.issue_type === 'screen_limit' ? '📺 Screen' :
                             c.issue_type === 'suspended' ? '🚫 Suspended' : '❓ Other'}
                          </span>
                        ) : (c.reason || '-')}
                      </span>
                    </td>
                    <td>{getStatusBadge(c.status)}</td>
                    <td>
                      <button 
                        onClick={() => {
                          setSelectedClaim(c);
                          setUpdateData({
                            status: ['pending', 'approved', 'rejected'].includes(c.status) ? c.status : '',
                            admin_notes: c.admin_notes || '',
                            resolution_notes: c.resolution_notes || '',
                            new_email: c.new_email || ''
                          });
                          setAvailableBackups([]);
                          setSelectedBackupId('');
                          setReplaceResult(null);
                          setUpdateError('');
                          setShowModal(true);
                        }} 
                        className="btn btn-secondary btn-sm"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {showModal && selectedClaim && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h3 className="modal-title">🛡️ Detail Klaim Garansi</h3>
            
            <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Claim Info */}
              <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-secondary)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 700 }}>
                  Informasi Klaim
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Kode:</span> <strong style={{ fontFamily: 'monospace' }}>{selectedClaim.claim_code}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Waktu:</span> {new Date(selectedClaim.created_at).toLocaleString('id-ID')}</div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Order:</span> <strong>{selectedClaim.orders?.order_number || selectedClaim.order_id}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Produk:</span> {selectedClaim.products?.name || '-'}</div>
                  {selectedClaim.orders?.buyer_email && (
                    <>
                      <div><span style={{ color: 'var(--text-muted)' }}>Nama Pembeli:</span> {selectedClaim.orders.buyer_email.name || 'Tanpa Nama'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>No WA:</span>{' '}
                        {selectedClaim.orders.buyer_email.phone ? (
                          <>
                            <a href={`https://wa.me/${selectedClaim.orders.buyer_email.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', textDecoration: 'none', fontWeight: 600 }}>
                              {selectedClaim.orders.buyer_email.phone}
                            </a>
                            <a 
                              href={`https://wa.me/${selectedClaim.orders.buyer_email.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Halo ${selectedClaim.orders.buyer_email.name || ''}, terkait klaim garansi Anda untuk produk ${selectedClaim.products?.name || ''} (Order ${selectedClaim.orders?.order_number || selectedClaim.order_id}). \n\n${updateData.new_email || selectedClaim.new_email ? `Berikut akun penggantinya:\n${updateData.new_email || selectedClaim.new_email}\n\n` : ''}${updateData.resolution_notes || selectedClaim.resolution_notes ? `Catatan: ${updateData.resolution_notes || selectedClaim.resolution_notes}` : ''}`)}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="btn btn-sm" 
                              style={{ background: '#25D366', color: '#fff', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              💬 Chat WA
                            </a>
                          </>
                        ) : '-'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Reported Account */}
              <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-secondary)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 700 }}>
                  Akun Dilaporkan
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> <strong style={{ fontFamily: 'monospace' }}>{selectedClaim.reported_email}</strong></div>
                  <div style={{ marginTop: '4px' }}><span style={{ color: 'var(--text-muted)' }}>Kendala:</span> {selectedClaim.issue_type || selectedClaim.reason || '-'}</div>
                  {selectedClaim.issue_description && (
                    <div style={{ marginTop: '4px' }}><span style={{ color: 'var(--text-muted)' }}>Detail:</span> {selectedClaim.issue_description}</div>
                  )}
                </div>
              </div>

              {/* Replacement info */}
              {(selectedClaim.status === 'auto_replaced' || selectedClaim.replacement_backup_id) && selectedClaim.backup_accounts && (
                <div style={{ background: 'rgba(34,197,94,0.06)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 700 }}>
                    ✅ Akun Pengganti
                  </div>
                  <div style={{ fontSize: '0.85rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Email Baru:</span> <strong style={{ fontFamily: 'monospace', color: '#22c55e' }}>{selectedClaim.new_email || selectedClaim.backup_accounts.account_identifier}</strong></div>
                    <div style={{ marginTop: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Akun pengganti diberikan setelah keputusan manual admin.</div>
                  </div>
                </div>
              )}

              {selectedClaim.status === 'pending' && (
                <div style={{ background: 'rgba(234,179,8,0.06)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(234,179,8,0.2)', fontSize: '0.82rem', color: '#eab308' }}>
                  Tinjau ID pesanan dan ketentuan garansi, lalu pilih keputusan <strong>Diterima</strong> atau <strong>Ditolak</strong> di bawah.
                </div>
              )}

              {/* Replacement is available only after the admin approves the claim. */}
              {selectedClaim.status === 'approved' && !selectedClaim.replacement_backup_id && !replaceResult?.message && (
                <div style={{ background: 'rgba(59,130,246,0.06)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', fontWeight: 700 }}>
                    🔧 Berikan Akun Pengganti
                  </div>
                  {availableBackups.length === 0 && !loadingBackups ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => fetchAvailableBackups(selectedClaim.product_id)}
                    >
                      Cari Akun Backup Tersedia
                    </button>
                  ) : loadingBackups ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Memuat backup...</div>
                  ) : availableBackups.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: '#f97316' }}>⚠️ Tidak ada akun backup tersedia untuk produk ini.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <select
                        className="form-select"
                        value={selectedBackupId}
                        onChange={e => setSelectedBackupId(e.target.value)}
                        style={{ fontSize: '0.85rem' }}
                      >
                        <option value="">-- Pilih akun backup --</option>
                        {availableBackups.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.account_identifier} (#{b.sort_order || '-'})</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!selectedBackupId || replacing}
                        onClick={handleManualReplace}
                        style={{ background: '#3b82f6' }}
                      >
                        {replacing ? 'Mengganti...' : '✅ Ganti Sekarang'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Replace Result */}
              {replaceResult?.message && (
                <div style={{ background: 'rgba(34,197,94,0.08)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', fontWeight: 700 }}>✅ Berhasil Diganti</div>
                  <div style={{ fontSize: '0.85rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Email Baru:</span> <strong style={{ fontFamily: 'monospace', color: '#22c55e' }}>{replaceResult.new_email}</strong></div>
                    <div style={{ marginTop: '4px' }}><span style={{ color: 'var(--text-muted)' }}>Password:</span> <strong style={{ fontFamily: 'monospace', color: '#22c55e' }}>{replaceResult.new_password}</strong></div>
                  </div>
                </div>
              )}
              {replaceResult?.error && (
                <div style={{ background: 'rgba(239,68,68,0.08)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.85rem', color: '#ef4444' }}>
                  ❌ {replaceResult.error}
                </div>
              )}

              {/* Resolution notes */}
              {selectedClaim.resolution_notes && !replaceResult?.message && (
                <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-secondary)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px', fontWeight: 700 }}>
                    Catatan Resolusi
                  </div>
                  <p style={{ fontSize: '0.85rem', margin: 0 }}>{selectedClaim.resolution_notes}</p>
                </div>
              )}
            </div>

            {/* Edit Form */}
            <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Status Klaim</label>
                <select 
                  className="form-select"
                  value={updateData.status}
                  onChange={e => {
                    const nextStatus = e.target.value;
                    const defaultNote = nextStatus === 'approved'
                      ? 'Klaim diterima setelah peninjauan manual admin.'
                      : nextStatus === 'rejected'
                        ? 'Klaim ditolak setelah peninjauan manual karena tidak memenuhi ketentuan garansi.'
                        : 'Pengajuan sedang menunggu peninjauan manual admin.';
                    setUpdateData({ ...updateData, status: nextStatus, resolution_notes: defaultNote });
                  }}
                  disabled={selectedClaim.status === 'auto_replaced' || Boolean(selectedClaim.replacement_backup_id)}
                >
                  {!['pending', 'approved', 'rejected'].includes(selectedClaim.status) && (
                    <option value="">Status lama — pilih keputusan baru</option>
                  )}
                  <option value="pending">Menunggu Peninjauan</option>
                  <option value="approved">Diterima</option>
                  <option value="rejected">Ditolak</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Keputusan hanya dapat dilakukan admin setelah memeriksa ID pesanan dan ketentuan garansi.
                </p>
                {(selectedClaim.status === 'auto_replaced' || selectedClaim.replacement_backup_id) && (
                  <p style={{ fontSize: '0.75rem', color: '#eab308', marginTop: '4px' }}>Keputusan dikunci karena akun pengganti sudah diberikan.</p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Akun Pengganti / Garansian</label>
                <input 
                  type="text"
                  className="form-input"
                  value={updateData.new_email || ''} 
                  onChange={e => setUpdateData({...updateData, new_email: e.target.value})}
                  placeholder="Contoh: email@gmail.com:password123 (opsional)"
                />
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Isi jika Anda mengganti akun secara manual (di luar pool backup).</p>
              </div>
              <div className="form-group">
                <label className="form-label">Catatan Admin (Internal)</label>
                <textarea 
                  className="form-textarea"
                  value={updateData.admin_notes} 
                  onChange={e => setUpdateData({...updateData, admin_notes: e.target.value})}
                  placeholder="Catatan internal untuk admin..."
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Catatan Resolusi (untuk buyer)</label>
                <textarea 
                  className="form-textarea"
                  value={updateData.resolution_notes} 
                  onChange={e => setUpdateData({...updateData, resolution_notes: e.target.value})}
                  placeholder="Catatan penyelesaian yang bisa dilihat buyer..."
                  rows={2}
                />
              </div>
              {updateError && (
                <div style={{ color: '#ef4444', fontSize: '0.82rem' }}>{updateError}</div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Tutup</button>
                <button type="submit" className="btn btn-primary" disabled={savingDecision}>
                  {savingDecision ? 'Menyimpan...' : 'Simpan Keputusan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
