'use client';

import { useState, useEffect } from 'react';

export default function AdminBackupAccounts() {
  const [backups, setBackups] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [decryptedPasswords, setDecryptedPasswords] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    id: '', product_id: '', account_identifier: '', account_secret: '', profile_info: '', pin_info: '', notes: ''
  });

  useEffect(() => {
    fetchBackups();
    fetchProducts();
  }, []);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backup-accounts');
      const data = await res.json();
      setBackups(data || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    const res = await fetch('/api/admin/products');
    const data = await res.json();
    setProducts(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!formData.id;
    const method = isEdit ? 'PUT' : 'POST';
    
    await fetch('/api/admin/backup-accounts', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    setShowModal(false);
    fetchBackups();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin hapus akun backup ini?')) return;
    await fetch(`/api/admin/backup-accounts?id=${id}`, { method: 'DELETE' });
    fetchBackups();
  };

  const togglePasswordVisibility = async (id: string) => {
    if (decryptedPasswords[id]) {
      // Hide
      const newMap = { ...decryptedPasswords };
      delete newMap[id];
      setDecryptedPasswords(newMap);
    } else {
      // Show
      try {
        const res = await fetch(`/api/admin/backup-accounts/decrypt?id=${id}`);
        const data = await res.json();
        if (data.secret) {
          setDecryptedPasswords({ ...decryptedPasswords, [id]: data.secret });
        }
      } catch (err) {
        console.error('Failed to decrypt password', err);
      }
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Akun Backup & Garansi</h1>
        <button onClick={() => {
          setFormData({ id: '', product_id: '', account_identifier: '', account_secret: '', profile_info: '', pin_info: '', notes: '' });
          setShowModal(true);
        }} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Tambah Backup
        </button>
      </div>

      <div className="bg-[#111] rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm text-left text-white/70">
          <thead className="text-xs text-white/50 uppercase bg-black/40 border-b border-white/10">
            <tr>
              <th className="px-6 py-4">Produk</th>
              <th className="px-6 py-4">Email Akun</th>
              <th className="px-6 py-4">Password</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-4 text-center">Loading...</td></tr>
            ) : backups.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-4 text-center">Belum ada data backup akun</td></tr>
            ) : (
              backups.map(b => (
                <tr key={b.id} className="border-b border-white/10 hover:bg-white/5">
                  <td className="px-6 py-4 font-medium text-white">{b.products?.name}</td>
                  <td className="px-6 py-4">{b.account_identifier}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-black px-2 py-1 rounded text-xs border border-white/10">
                        {decryptedPasswords[b.id] ? decryptedPasswords[b.id] : '••••••••'}
                      </span>
                      <button 
                        onClick={() => togglePasswordVisibility(b.id)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {decryptedPasswords[b.id] ? 'Sembunyikan' : 'Tampilkan'}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs ${b.status === 'available' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => { setFormData(b); setShowModal(true); }} className="text-blue-400 hover:underline">Edit</button>
                    <button onClick={() => handleDelete(b.id)} className="text-red-400 hover:underline">Hapus</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{formData.id ? 'Edit Backup' : 'Tambah Backup'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs mb-1">Produk</label>
                <select 
                  className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white"
                  value={formData.product_id}
                  onChange={e => setFormData({...formData, product_id: e.target.value})}
                  required
                >
                  <option value="">Pilih Produk</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1">Email / Identifier</label>
                <input required className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white" value={formData.account_identifier} onChange={e => setFormData({...formData, account_identifier: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs mb-1">Password {formData.id && '(Kosongkan jika tidak diubah)'}</label>
                <input required={!formData.id} type="password" className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white" value={formData.account_secret} onChange={e => setFormData({...formData, account_secret: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs mb-1">Catatan</label>
                <input className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-white/50 hover:text-white">Batal</button>
                <button type="submit" className="px-4 py-2 text-sm bg-purple-600 text-white rounded">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
