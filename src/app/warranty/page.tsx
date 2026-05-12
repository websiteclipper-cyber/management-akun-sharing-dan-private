'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FiAlertCircle, FiCheckCircle, FiShield } from 'react-icons/fi';
import Link from 'next/link';

export default function WarrantyClaimPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    order_number: '',
    reported_email: '',
    reported_password: '',
    issue_type: 'password_changed',
    issue_description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/warranty/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Terjadi kesalahan sistem');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('Gagal menghubungi server. Periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black/95 text-white flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-block mb-8 text-white/50 hover:text-white transition">
          ← Kembali ke Beranda
        </Link>
        
        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <FiShield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Klaim Garansi</h1>
              <p className="text-sm text-white/50">Layanan penggantian akun otomatis</p>
            </div>
          </div>

          {result ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {result.status === 'auto_replaced' ? (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <FiCheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-green-400 mb-1">Berhasil Diganti!</h3>
                      <p className="text-sm text-green-400/80 mb-3">{result.resolution_notes}</p>
                      <div className="bg-black/40 rounded-lg p-3 space-y-2 text-sm border border-white/5">
                        <div className="flex justify-between">
                          <span className="text-white/50">Email Baru:</span>
                          <strong className="text-white select-all">{result.new_email}</strong>
                        </div>
                        {/* Note: In real app, new_password_encrypted should be decrypted, but assuming we show it raw or have a decrypt endpoint. For safety, we just tell them to check email or contact admin if encrypted */}
                        <div className="flex justify-between">
                          <span className="text-white/50">Password:</span>
                          <strong className="text-white select-all">Tersedia di dashboard pesanan Anda</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <FiAlertCircle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-orange-400 mb-1">Klaim Diterima</h3>
                      <p className="text-sm text-orange-400/80">Kode Klaim: <strong>{result.claim_code}</strong></p>
                      <p className="text-sm text-orange-400/80 mt-2">{result.resolution_notes}</p>
                    </div>
                  </div>
                </div>
              )}

              <button 
                onClick={() => setResult(null)} 
                className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 transition text-sm font-medium"
              >
                Klaim Lainnya
              </button>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                  <FiAlertCircle className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">No. Pesanan</label>
                <input
                  type="text"
                  required
                  placeholder="ORD-XXXXX"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 transition"
                  value={formData.order_number}
                  onChange={e => setFormData({...formData, order_number: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Email Akun</label>
                <input
                  type="text"
                  required
                  placeholder="email@akun.com"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 transition"
                  value={formData.reported_email}
                  onChange={e => setFormData({...formData, reported_email: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Password Lama</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 transition"
                  value={formData.reported_password}
                  onChange={e => setFormData({...formData, reported_password: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Jenis Masalah</label>
                <select
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 transition text-white"
                  value={formData.issue_type}
                  onChange={e => setFormData({...formData, issue_type: e.target.value})}
                >
                  <option value="password_changed">Password Salah / Diubah</option>
                  <option value="screen_limit">Limit Screen (Terlalu Banyak Layar)</option>
                  <option value="suspended">Akun Suspended / Hold</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wider">Keterangan Tambahan (Opsional)</label>
                <textarea
                  placeholder="Detail masalah..."
                  rows={2}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50 transition resize-none"
                  value={formData.issue_description}
                  onChange={e => setFormData({...formData, issue_description: e.target.value})}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 mt-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_25px_rgba(147,51,234,0.5)] disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Kirim Klaim'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
