'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ResellerSession {
  id: string;
  name: string;
  ref_code: string;
  phone: string;
}

interface Commission {
  id: string;
  product_name?: string;
  order_amount?: number;
  commission_type?: string;
  commission_rate?: number;
  commission_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  order?: { order_number: string; total_amount: number; buyer: { name: string } };
}

interface ProductCommission {
  id: string;
  product_id: number;
  commission_type: string;
  commission_value: number;
  product?: { name: string; price: number };
}

interface DashboardData {
  reseller: {
    id: string;
    name: string;
    ref_code: string;
    phone: string;
    total_sales: number;
    total_commission: number;
    unpaid_commission: number;
    default_commission_type: string;
    default_commission_value: number;
  };
  commissions: Commission[];
  monthly: { sales: number; earnings: number };
  productCommissions: ProductCommission[];
}

export default function ResellerDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<ResellerSession | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'commissions' | 'rates'>('overview');
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    const sessionStr = localStorage.getItem('reseller_session');
    const token = localStorage.getItem('reseller_token');
    if (!sessionStr || !token) {
      router.push('/reseller/login');
      return;
    }
    setSession(JSON.parse(sessionStr));
    loadDashboard(token);
  }, [router]);

  async function loadDashboard(token: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/reseller/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('reseller_token');
          localStorage.removeItem('reseller_session');
          router.push('/reseller/login');
          return;
        }
        throw new Error('Failed to load');
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
    setLoading(false);
  }

  function handleLogout() {
    localStorage.removeItem('reseller_token');
    localStorage.removeItem('reseller_session');
    router.push('/reseller/login');
  }

  function copyLink() {
    if (!data) return;
    navigator.clipboard.writeText(`${siteUrl}/?ref=${data.reseller.ref_code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  }

  function formatCommission(type: string, value: number) {
    if (type === 'percentage') return `${value}%`;
    return formatPrice(value);
  }

  const filteredCommissions = data?.commissions.filter(c => {
    if (filter === 'unpaid') return c.status === 'unpaid';
    if (filter === 'paid') return c.status === 'paid';
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="public-layout">
        <div className="loading-page" style={{ minHeight: '100vh' }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!data || !session) return null;

  const r = data.reseller;

  return (
    <div className="public-layout">
      {/* Header */}
      <header className="public-header" style={{ justifyContent: 'space-between' }}>
        <Link href="/" className="brand">✦ pastipremium.store</Link>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>🤝 {session.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Mitra • {session.ref_code}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px 80px' }}>
        {/* Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 'var(--radius-xl)',
          padding: '28px 32px',
          marginBottom: '24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: '-50px', right: '-30px', fontSize: '8rem', opacity: 0.06 }}>🤝</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '6px' }}>
            Selamat datang, {r.name}! 👋
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
            Pantau performa penjualan dan komisi Anda di sini.
          </p>
          
          {/* Referral Link */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                🔗 Link Referral Anda
              </div>
              <code style={{ fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600, wordBreak: 'break-all' }}>
                {siteUrl}/?ref={r.ref_code}
              </code>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={copyLink}
              style={{ whiteSpace: 'nowrap' }}
            >
              {copied ? '✅ Tersalin!' : '📋 Copy Link'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <div className="stat-label">TOTAL PENJUALAN</div>
            <div className="stat-value">{r.total_sales}</div>
            <div className="stat-icon">🛒</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">TOTAL KOMISI</div>
            <div className="stat-value" style={{ color: 'var(--brand-success)' }}>{formatPrice(r.total_commission)}</div>
            <div className="stat-icon">💰</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">BELUM DIBAYAR</div>
            <div className="stat-value" style={{ color: r.unpaid_commission > 0 ? '#eab308' : 'var(--brand-success)' }}>
              {formatPrice(r.unpaid_commission)}
            </div>
            <div className="stat-icon">💸</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">BULAN INI</div>
            <div className="stat-value">{data.monthly.sales}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {formatPrice(data.monthly.earnings)}
            </div>
            <div className="stat-icon">📅</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${tab === 'overview' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('overview')}>
            📊 Ringkasan
          </button>
          <button className={`btn btn-sm ${tab === 'commissions' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('commissions')}>
            💰 Riwayat Komisi ({data.commissions.length})
          </button>
          <button className={`btn btn-sm ${tab === 'rates' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('rates')}>
            ⚙️ Rate Komisi
          </button>
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div>
            {/* Recent commissions */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Transaksi Terbaru</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setTab('commissions')}>Lihat Semua →</button>
              </div>

              {data.commissions.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">📊</div>
                  <h4>Belum ada transaksi</h4>
                  <p>Mulai bagikan link referral Anda untuk mendapatkan komisi!</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Tanggal</th>
                        <th>Order</th>
                        <th>Produk</th>
                        <th>Komisi</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.commissions.slice(0, 5).map(c => (
                        <tr key={c.id}>
                          <td style={{ fontSize: '0.8rem' }}>{new Date(c.created_at).toLocaleDateString('id-ID')}</td>
                          <td>
                            <code style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>{c.order?.order_number || '-'}</code>
                          </td>
                          <td style={{ fontWeight: 600 }}>{c.product_name || '-'}</td>
                          <td style={{ fontWeight: 700, color: 'var(--brand-success)' }}>{formatPrice(c.commission_amount)}</td>
                          <td>
                            <span className={`badge ${c.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                              {c.status === 'paid' ? '✅ Dibayar' : '⏳ Belum'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tips Section */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              marginTop: '16px',
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '16px' }}>💡 Tips Meningkatkan Penjualan</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {[
                  { icon: '📱', title: 'Share ke Status WA', desc: 'Bagikan link referral ke status WhatsApp Anda.' },
                  { icon: '👥', title: 'Grup & Komunitas', desc: 'Promosikan di grup yang relevan (grup film, musik, dll).' },
                  { icon: '🎯', title: 'Personal Approach', desc: 'Kirim pesan langsung ke teman yang butuh akun premium.' },
                  { icon: '📢', title: 'Sosial Media', desc: 'Post di Instagram, TikTok, atau Twitter dengan link Anda.' },
                ].map((tip, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px 16px',
                  }}>
                    <span style={{ fontSize: '1.2rem' }}>{tip.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '2px' }}>{tip.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tip.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COMMISSIONS TAB */}
        {tab === 'commissions' && (
          <div>
            {/* Filter */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {(['all', 'unpaid', 'paid'] as const).map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'Semua' : f === 'unpaid' ? '⏳ Belum Dibayar' : '✅ Sudah Dibayar'}
                </button>
              ))}
            </div>

            {/* Summary bar */}
            <div style={{
              display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap',
            }}>
              <div style={{
                flex: 1, minWidth: '200px',
                background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
                borderRadius: 'var(--radius-md)', padding: '14px 18px',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Belum Dibayar</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#eab308' }}>{formatPrice(r.unpaid_commission)}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {data.commissions.filter(c => c.status === 'unpaid').length} transaksi
                </div>
              </div>
              <div style={{
                flex: 1, minWidth: '200px',
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 'var(--radius-md)', padding: '14px 18px',
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sudah Dibayar</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--brand-success)' }}>
                  {formatPrice(r.total_commission - r.unpaid_commission)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {data.commissions.filter(c => c.status === 'paid').length} transaksi
                </div>
              </div>
            </div>

            {/* Commissions Table */}
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Order & Pembeli</th>
                    <th>Produk</th>
                    <th>Harga & Rate</th>
                    <th>Komisi</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommissions.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontSize: '0.8rem' }}>
                        {new Date(c.created_at).toLocaleString('id-ID')}
                      </td>
                      <td>
                        <div><code style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>{c.order?.order_number || '-'}</code></div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{(c.order?.buyer as any)?.name || '-'}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.product_name || '-'}</td>
                      <td>
                        <div>{c.order_amount ? formatPrice(c.order_amount) : '-'}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                          Rate: {formatCommission(c.commission_type || 'fixed', c.commission_rate || 0)}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--brand-success)' }}>
                        {formatPrice(c.commission_amount)}
                      </td>
                      <td>
                        <span className={`badge ${c.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                          {c.status === 'paid' ? '✅ Dibayar' : '⏳ Belum'}
                        </span>
                        {c.paid_at && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {new Date(c.paid_at).toLocaleDateString('id-ID')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredCommissions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        <div className="icon">📊</div>
                        <h4>{filter === 'all' ? 'Belum ada riwayat komisi' : `Tidak ada komisi ${filter === 'unpaid' ? 'yang belum dibayar' : 'yang sudah dibayar'}`}</h4>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* RATES TAB */}
        {tab === 'rates' && (
          <div>
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px 24px',
              marginBottom: '16px',
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '4px' }}>Komisi Default Anda</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                Rate ini berlaku untuk semua produk yang belum memiliki rate khusus.
              </p>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'var(--accent-soft)', padding: '10px 20px',
                borderRadius: 'var(--radius-full)', fontWeight: 700,
                color: 'var(--accent)', fontSize: '1.1rem',
              }}>
                {formatCommission(r.default_commission_type, r.default_commission_value)}
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>per transaksi</span>
              </div>
            </div>

            {data.productCommissions.length > 0 && (
              <div className="table-container">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-secondary)' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Rate Komisi per Produk</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Beberapa produk memiliki rate komisi khusus untuk Anda.</p>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Produk</th>
                      <th>Harga Produk</th>
                      <th>Tipe Komisi</th>
                      <th>Rate</th>
                      <th>Potensi Komisi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productCommissions.map(pc => {
                      const price = pc.product?.price || 0;
                      const potential = pc.commission_type === 'percentage'
                        ? Math.round(price * pc.commission_value / 100)
                        : pc.commission_value;
                      return (
                        <tr key={pc.id}>
                          <td style={{ fontWeight: 600 }}>{pc.product?.name || '-'}</td>
                          <td>{formatPrice(price)}</td>
                          <td>
                            <span className="badge badge-info">
                              {pc.commission_type === 'percentage' ? 'Persentase' : 'Fixed'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--accent)' }}>
                            {formatCommission(pc.commission_type, pc.commission_value)}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--brand-success)' }}>
                            {formatPrice(potential)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data.productCommissions.length === 0 && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-lg)', padding: '40px',
              }}>
                <div className="empty-state">
                  <div className="icon">⚙️</div>
                  <h4>Menggunakan Rate Default</h4>
                  <p>Semua produk menggunakan komisi default <strong style={{ color: 'var(--accent)' }}>{formatCommission(r.default_commission_type, r.default_commission_value)}</strong> per transaksi.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
