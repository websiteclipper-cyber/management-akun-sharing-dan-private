'use client';

import { useState, useEffect } from 'react';

export default function AdminWarrantyClaims() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [updateData, setUpdateData] = useState({
    status: '', admin_notes: ''
  });

  useEffect(() => {
    fetchClaims();
  }, []);

  const fetchClaims = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/warranty');
      const data = await res.json();
      setClaims(data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaim) return;
    
    await fetch('/api/admin/warranty', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: selectedClaim.id,
        status: updateData.status,
        admin_notes: updateData.admin_notes
      })
    });
    
    setShowModal(false);
    fetchClaims();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/20 text-yellow-400';
      case 'auto_replaced': return 'bg-blue-500/20 text-blue-400';
      case 'resolved': return 'bg-green-500/20 text-green-400';
      case 'rejected': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Klaim Garansi</h1>
        <button onClick={fetchClaims} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          Refresh Data
        </button>
      </div>

      <div className="bg-[#111] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm text-left text-white/70">
          <thead className="text-xs text-white/50 uppercase bg-black/40 border-b border-white/10">
            <tr>
              <th className="px-6 py-4">Waktu</th>
              <th className="px-6 py-4">Order ID</th>
              <th className="px-6 py-4">Produk</th>
              <th className="px-6 py-4">Kendala</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center">Loading...</td></tr>
            ) : claims.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-4 text-center">Belum ada klaim garansi</td></tr>
            ) : (
              claims.map(c => (
                <tr key={c.id} className="border-b border-white/10 hover:bg-white/5">
                  <td className="px-6 py-4 whitespace-nowrap">{new Date(c.created_at).toLocaleString('id-ID')}</td>
                  <td className="px-6 py-4 font-mono text-xs text-white/50">{c.order_id?.substring(0,8)}...</td>
                  <td className="px-6 py-4 font-medium text-white">{c.orders?.products?.name || '-'}</td>
                  <td className="px-6 py-4 truncate max-w-[200px]">{c.issue_description}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(c.status)}`}>
                      {c.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={() => {
                        setSelectedClaim(c);
                        setUpdateData({ status: c.status, admin_notes: c.admin_notes || '' });
                        setShowModal(true);
                      }} 
                      className="text-blue-400 hover:underline"
                    >
                      Detail & Proses
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && selectedClaim && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Proses Klaim Garansi</h2>
            
            <div className="mb-6 space-y-3 text-sm">
              <div className="bg-black/50 p-3 rounded border border-white/5">
                <p className="text-white/50 text-xs mb-1">Informasi Pesanan</p>
                <p><strong>Order ID:</strong> <span className="font-mono">{selectedClaim.order_id}</span></p>
                <p><strong>Produk:</strong> {selectedClaim.orders?.products?.name}</p>
                <p><strong>Kontak Pembeli:</strong> {selectedClaim.orders?.buyer_email || selectedClaim.orders?.buyer_phone}</p>
              </div>
              
              <div className="bg-black/50 p-3 rounded border border-white/5">
                <p className="text-white/50 text-xs mb-1">Detail Kendala</p>
                <p className="whitespace-pre-wrap">{selectedClaim.issue_description}</p>
              </div>

              {selectedClaim.status === 'auto_replaced' && selectedClaim.backup_accounts && (
                <div className="bg-blue-500/10 p-3 rounded border border-blue-500/20">
                  <p className="text-blue-400 text-xs mb-1">Akun Pengganti (Auto Replaced)</p>
                  <p><strong>Email:</strong> {selectedClaim.backup_accounts.account_identifier}</p>
                  <p className="text-xs mt-1 text-white/50">Password telah otomatis diberikan ke pembeli.</p>
                </div>
              )}
            </div>

            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs mb-1">Status Klaim</label>
                <select 
                  className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white"
                  value={updateData.status}
                  onChange={e => setUpdateData({...updateData, status: e.target.value})}
                  disabled={selectedClaim.status === 'auto_replaced'}
                >
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved (Selesai Manual)</option>
                  <option value="rejected">Rejected (Ditolak)</option>
                  <option value="auto_replaced" disabled>Auto Replaced</option>
                </select>
                {selectedClaim.status === 'auto_replaced' && (
                  <p className="text-xs text-yellow-500 mt-1">Status Auto Replaced tidak bisa diubah.</p>
                )}
              </div>
              <div>
                <label className="block text-xs mb-1">Catatan Admin</label>
                <textarea 
                  className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white h-24" 
                  value={updateData.admin_notes} 
                  onChange={e => setUpdateData({...updateData, admin_notes: e.target.value})}
                  placeholder="Catatan internal atau alasan penolakan..."
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-white/50 hover:text-white">Batal</button>
                <button type="submit" className="px-4 py-2 text-sm bg-purple-600 text-white rounded" disabled={selectedClaim.status === 'auto_replaced' && updateData.admin_notes === selectedClaim.admin_notes}>
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
