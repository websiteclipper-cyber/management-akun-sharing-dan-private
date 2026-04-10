'use client';

import { useState, useEffect } from 'react';

interface Product {
  id: number;
  name: string;
  price: number;
}

interface ProductCommission {
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
}

export default function AdminCommissionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [defaultCommission, setDefaultCommission] = useState({ type: 'fixed' as 'fixed' | 'percentage', value: 3000 });
  const [productCommissions, setProductCommissions] = useState<Record<number, ProductCommission>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/commissions/settings', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setDefaultCommission({ type: data.defaultCommission.type, value: data.defaultCommission.value });
        setProducts(data.products || []);
        setProductCommissions(data.productCommissions || {});
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/commissions/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ defaultCommission, productCommissions }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert('Gagal menyimpan: ' + (data.error || 'Unknown error'));
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      alert('Gagal koneksi ke server');
    }
    setSaving(false);
  }

  function setProductComm(productId: number, field: 'commission_type' | 'commission_value', value: any) {
    setProductCommissions(prev => {
      const existing = prev[productId] || { commission_type: 'fixed', commission_value: 0 };
      return { ...prev, [productId]: { ...existing, [field]: value } };
    });
  }

  function removeProductComm(productId: number) {
    setProductCommissions(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  }

  function calcCommission(type: string, value: number, price: number) {
    if (type === 'percentage') return Math.round(price * value / 100);
    return value;
  }

  if (loading) {
    return <div className="loading-page"><div className="loading-spinner" /></div>;
  }

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>⚙️ Pengaturan Komisi</h1>
          <p style={{ color: 'var(--text-muted)' }}>Atur komisi mitra di satu tempat. Perubahan akan berlaku untuk <strong style={{ color: 'var(--accent)' }}>SEMUA mitra</strong>.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saved ? '#22c55e' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            border: 'none', minWidth: '180px', justifyContent: 'center',
            transition: 'all 0.3s'
          }}
        >
          {saving ? <span className="loading-spinner" /> : saved ? '✅ Tersimpan!' : '💾 Simpan & Terapkan Semua'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: '24px',
        display: 'flex', gap: '10px', alignItems: 'flex-start'
      }}>
        <span style={{ fontSize: '1.2rem' }}>💡</span>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong>Cara kerja:</strong> Komisi yang Anda atur di sini akan otomatis berlaku ke <strong>semua mitra</strong>, 
          termasuk mitra baru yang mendaftar nanti. Jika sebuah produk tidak diatur khusus, 
          maka akan mengikuti <strong>Komisi Default</strong>.
        </div>
      </div>

      {/* Default Commission Card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
        borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px'
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ background: 'var(--accent-soft)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.9rem' }}>📌</span>
          Komisi Default
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Berlaku untuk semua produk yang <strong>tidak</strong> memiliki pengaturan khusus di bawah.
        </p>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, flex: '0 0 200px' }}>
            <label className="form-label">Tipe Komisi</label>
            <select
              className="form-input"
              value={defaultCommission.type}
              onChange={e => setDefaultCommission(prev => ({ ...prev, type: e.target.value as 'fixed' | 'percentage' }))}
            >
              <option value="fixed">Fixed (Rp)</option>
              <option value="percentage">Persentase (%)</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: '0 0 200px' }}>
            <label className="form-label">
              Nilai {defaultCommission.type === 'fixed' ? '(Rupiah)' : '(Persen)'}
            </label>
            <input
              type="number"
              className="form-input"
              min={0}
              value={defaultCommission.value}
              onChange={e => setDefaultCommission(prev => ({ ...prev, value: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div style={{
            background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
            padding: '10px 16px', fontSize: '0.85rem', fontWeight: 600,
          }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'block', marginBottom: '2px' }}>Preview</span>
            <span style={{ color: 'var(--accent)' }}>
              {defaultCommission.type === 'fixed'
                ? formatPrice(defaultCommission.value) + ' / sale'
                : defaultCommission.value + '% dari harga produk'
              }
            </span>
          </div>
        </div>
      </div>

      {/* Per-Product Commissions */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
        borderRadius: 'var(--radius-lg)', padding: '24px'
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ background: 'rgba(234,179,8,0.15)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.9rem' }}>🎯</span>
          Komisi Per Produk
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Override komisi untuk produk tertentu. Produk yang tidak diatur di sini akan mengikuti <strong>Komisi Default</strong> di atas.
        </p>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Harga Produk</th>
                <th>Tipe Komisi</th>
                <th>Nilai Komisi</th>
                <th>Komisi Aktual</th>
                <th style={{ width: '60px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const hasCustom = productCommissions[p.id] !== undefined;
                const commType = hasCustom ? productCommissions[p.id].commission_type : defaultCommission.type;
                const commVal = hasCustom ? productCommissions[p.id].commission_value : defaultCommission.value;
                const actualAmount = calcCommission(commType, commVal, p.price);

                return (
                  <tr key={p.id} style={hasCustom ? { background: 'rgba(234,179,8,0.04)' } : {}}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatPrice(p.price)}</td>
                    <td>
                      <select
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '0.8rem', height: 'auto' }}
                        value={hasCustom ? commType : 'default'}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === 'default') {
                            removeProductComm(p.id);
                          } else {
                            setProductComm(p.id, 'commission_type', val as 'fixed' | 'percentage');
                          }
                        }}
                      >
                        <option value="default">📌 Ikuti Default</option>
                        <option value="fixed">Fixed (Rp)</option>
                        <option value="percentage">Persentase (%)</option>
                      </select>
                    </td>
                    <td>
                      {hasCustom ? (
                        <input
                          type="number"
                          className="form-input"
                          style={{ padding: '6px 10px', fontSize: '0.8rem', height: 'auto', width: '120px' }}
                          min={0}
                          value={commVal}
                          onChange={e => setProductComm(p.id, 'commission_value', parseInt(e.target.value) || 0)}
                        />
                      ) : (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          {defaultCommission.type === 'fixed' ? formatPrice(defaultCommission.value) : defaultCommission.value + '%'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontWeight: 700,
                        color: hasCustom ? '#eab308' : 'var(--brand-success)',
                        fontSize: '0.9rem'
                      }}>
                        {formatPrice(actualAmount)}
                      </span>
                      {hasCustom && (
                        <span style={{
                          display: 'inline-block', marginLeft: '6px',
                          background: 'rgba(234,179,8,0.15)', color: '#eab308',
                          padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 600
                        }}>
                          CUSTOM
                        </span>
                      )}
                    </td>
                    <td>
                      {hasCustom && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#ef4444' }}
                          onClick={() => removeProductComm(p.id)}
                          title="Reset ke default"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <div className="icon">📦</div>
                    <h3>Belum ada produk aktif</h3>
                    <p>Tambahkan produk terlebih dahulu di menu Produk.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom save button */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', marginTop: '24px',
        paddingTop: '20px', borderTop: '1px solid var(--border-secondary)'
      }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saved ? '#22c55e' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            border: 'none', minWidth: '220px', justifyContent: 'center',
            padding: '12px 24px', fontSize: '0.95rem',
            transition: 'all 0.3s'
          }}
        >
          {saving ? <span className="loading-spinner" /> : saved ? '✅ Tersimpan!' : '💾 Simpan & Terapkan ke Semua Mitra'}
        </button>
      </div>
    </div>
  );
}
