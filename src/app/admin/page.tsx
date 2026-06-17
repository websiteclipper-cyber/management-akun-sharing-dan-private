'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface SalesData {
  // Summary cards
  totalRevenue: number;
  totalOrders: number;
  totalBuyers: number;
  totalStockActive: number;
  // Today
  revenueToday: number;
  ordersToday: number;
  paidToday: number;
  pendingPayment: number;
  needsAssignment: number;
  openTickets: number;
  // Products
  totalActiveProducts: number;
  sharingAvailable: number;
  privateAvailable: number;
  fullAccounts: number;
  // Recent orders
  recentOrders: any[];
  // Top products
  topProducts: any[];
  // Revenue per day (last 7 days)
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  // Order status breakdown
  statusBreakdown: Record<string, number>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiringLoading, setExpiringLoading] = useState(false);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadDashboard(); }, []);

  useEffect(() => {
    // Automatically scroll the chart to the rightmost edge (latest dates) 
    // when data finishes loading.
    if (chartScrollRef.current && data) {
      chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
    }
  }, [data]);

  async function handleAutoExpire() {
    setExpiringLoading(true);
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch('/api/admin/auto-expire', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) {
        if (result.expired_count > 0) {
          alert(`✅ Auto-Expire selesai!\n\n${result.expired_count} assignment di-expire\n${result.updated_slots} slot dibebaskan`);
          loadDashboard();
        } else {
          alert('✅ Tidak ada assignment yang perlu di-expire saat ini.');
        }
      } else {
        alert('Error: ' + (result.error || 'Unknown'));
      }
    } catch {
      alert('Terjadi kesalahan jaringan');
    }
    setExpiringLoading(false);
  }

  async function loadDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const [
      { count: totalActiveProducts },
      { count: totalStockActive },
      { count: sharingAvailable },
      { count: privateAvailable },
      { count: fullAccounts },
      { count: ordersToday },
      { count: paidToday },
      { count: pendingPayment },
      { count: needsAssignment },
      { count: openTickets },
      { count: totalBuyers },
      { count: totalOrdersCount },
      { data: recentOrders },
    ] = await Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('stock_accounts').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('stock_accounts').select('*', { count: 'exact', head: true }).eq('account_type', 'sharing').eq('status', 'active'),
      supabase.from('stock_accounts').select('*', { count: 'exact', head: true }).eq('account_type', 'private').eq('status', 'active'),
      supabase.from('stock_accounts').select('*', { count: 'exact', head: true }).eq('status', 'full'),
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid').gte('created_at', todayISO),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'pending_payment'),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'paid').in('order_status', ['paid']),
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      supabase.from('buyers').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*', { count: 'exact', head: true }),
      supabase.from('orders').select('*, buyer:buyers(name, phone), product:products(name, platform_name)').order('created_at', { ascending: false }).limit(10),
    ]);

    const totalOrders = totalOrdersCount || 0;

    // Fetch total revenue in pages to bypass PostgREST 1000 limit
    let totalRevenue = 0;
    let revenuePage = 0;
    const pageSize = 1000;
    while (true) {
      const { data: pageData, error: pageErr } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('payment_status', 'paid')
        .range(revenuePage * pageSize, (revenuePage + 1) * pageSize - 1);
      if (pageErr || !pageData || pageData.length === 0) break;
      totalRevenue += pageData.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
      if (pageData.length < pageSize) break;
      revenuePage++;
    }

    // Fetch last 30 days orders in pages
    let last30DaysOrders: any[] = [];
    let last30Page = 0;
    while (true) {
      const { data: pageData, error: pageErr } = await supabase
        .from('orders')
        .select('total_amount, created_at, payment_status, product_id')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('payment_status', 'paid')
        .range(last30Page * pageSize, (last30Page + 1) * pageSize - 1);
      if (pageErr || !pageData || pageData.length === 0) break;
      last30DaysOrders = [...last30DaysOrders, ...pageData];
      if (pageData.length < pageSize) break;
      last30Page++;
    }

    // Revenue today
    const todayPaidOrders = (last30DaysOrders || []).filter((o: any) => {
      const d = new Date(o.created_at);
      return d >= today;
    });
    const revenueToday = todayPaidOrders.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);

    // Daily revenue chart data (last 30 days)
    const dailyRevenue: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);

      const dayOrders = (last30DaysOrders || []).filter((o: any) => {
        const od = new Date(o.created_at);
        return od >= d && od < nextD;
      });

      dailyRevenue.push({
        date: d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
        revenue: dayOrders.reduce((s: number, o: any) => s + (o.total_amount || 0), 0),
        orders: dayOrders.length,
      });
    }

    // Top products (paged fetch to prevent 1000 limit)
    const productMap: Record<number, { name: string; count: number; revenue: number }> = {};
    let productSales: any[] = [];
    let productPage = 0;
    while (true) {
      const { data: pageData, error: pageErr } = await supabase
        .from('orders')
        .select('product_id, total_amount, product:products(name)')
        .eq('payment_status', 'paid')
        .range(productPage * pageSize, (productPage + 1) * pageSize - 1);
      if (pageErr || !pageData || pageData.length === 0) break;
      productSales = [...productSales, ...pageData];
      if (pageData.length < pageSize) break;
      productPage++;
    }

    (productSales || []).forEach((o: any) => {
      const pid = o.product_id;
      if (!productMap[pid]) {
        productMap[pid] = { name: o.product?.name || `Product #${pid}`, count: 0, revenue: 0 };
      }
      productMap[pid].count++;
      productMap[pid].revenue += o.total_amount || 0;
    });

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Status breakdown (using parallel counts rather than fetching all rows)
    const statuses = ['pending', 'paid', 'assigned', 'delivered', 'completed', 'cancelled', 'refunded', 'pending_payment', 'failed'];
    const statusCounts = await Promise.all(
      statuses.map(async (status) => {
        const { count } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('order_status', status);
        return { status, count: count || 0 };
      })
    );
    const statusBreakdown = statusCounts.reduce((acc, curr) => {
      acc[curr.status] = curr.count;
      return acc;
    }, {} as Record<string, number>);

    setData({
      totalRevenue,
      totalOrders,
      totalBuyers: totalBuyers || 0,
      totalStockActive: totalStockActive || 0,
      revenueToday,
      ordersToday: ordersToday || 0,
      paidToday: paidToday || 0,
      pendingPayment: pendingPayment || 0,
      needsAssignment: needsAssignment || 0,
      openTickets: openTickets || 0,
      totalActiveProducts: totalActiveProducts || 0,
      sharingAvailable: sharingAvailable || 0,
      privateAvailable: privateAvailable || 0,
      fullAccounts: fullAccounts || 0,
      recentOrders: recentOrders || [],
      topProducts,
      dailyRevenue,
      statusBreakdown,
    });
    setLoading(false);
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  function formatNumber(n: number) {
    return new Intl.NumberFormat('id-ID').format(n);
  }

  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      pending: 'badge-neutral', paid: 'badge-info', assigned: 'badge-primary',
      delivered: 'badge-success', completed: 'badge-success', cancelled: 'badge-danger',
      refunded: 'badge-warning', pending_payment: 'badge-neutral', failed: 'badge-danger',
    };
    return map[status] || 'badge-neutral';
  }

  function getStatusLabel(status: string) {
    const map: Record<string, string> = {
      pending: 'Pending', paid: 'Paid', assigned: 'Assigned',
      delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
      refunded: 'Refunded',
    };
    return map[status] || status;
  }

  if (loading) {
    return (
      <div className="admin-content">
        <div className="loading-page"><div className="loading-spinner" /></div>
      </div>
    );
  }

  const maxRevenue = Math.max(...(data?.dailyRevenue.map(d => d.revenue) || [1]));

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <div>
          <h2>Dashboard</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Monitoring Penjualan — pastipremium.my.id</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); loadDashboard(); }}>
            🔄 Refresh
          </button>
          <button
            className="btn btn-sm"
            style={{ backgroundColor: '#f59e0b', color: '#000', border: 'none', fontWeight: 600 }}
            onClick={handleAutoExpire}
            disabled={expiringLoading}
          >
            {expiringLoading ? <span className="loading-spinner" style={{ width: '14px', height: '14px' }} /> : '⏰ Run Auto-Expire'}
          </button>
        </div>
      </div>

      <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

        {/* ===== ROW 1: Revenue Summary ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div style={{ background: 'var(--accent)', borderRadius: 'var(--radius-xl)', padding: '28px', color: '#fff', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' as const, opacity: 0.75, marginBottom: '10px' }}>💰 Total Revenue</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em' }}>{formatPrice(data?.totalRevenue || 0)}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>{formatNumber(data?.totalOrders || 0)} total pesanan</div>
          </div>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', padding: '28px', border: '1px solid var(--border-secondary)', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: '10px' }}>📈 Revenue Hari Ini</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--brand-success)' }}>{formatPrice(data?.revenueToday || 0)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{data?.paidToday} pesanan lunas hari ini</div>
          </div>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', padding: '28px', border: '1px solid var(--border-secondary)', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' as const, color: 'var(--text-muted)', marginBottom: '10px' }}>👥 Total Buyer</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em' }}>{formatNumber(data?.totalBuyers || 0)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{data?.ordersToday} order hari ini</div>
          </div>
        </div>

        {/* ===== ROW 2: Quick Stats ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Produk Aktif', value: data?.totalActiveProducts, icon: '📦', color: '#6C5CE7' },
            { label: 'Stok Aktif', value: data?.totalStockActive, icon: '🔑', color: '#00D2D3' },
            { label: 'Sharing', value: data?.sharingAvailable, icon: '👥', color: '#74B9FF' },
            { label: 'Private', value: data?.privateAvailable, icon: '🔒', color: '#A29BFE' },
            { label: 'Akun Penuh', value: data?.fullAccounts, icon: '🚫', color: '#E17055' },
            { label: 'Pending Bayar', value: data?.pendingPayment, icon: '⏳', color: '#FDCB6E' },
            { label: 'Perlu Assign', value: data?.needsAssignment, icon: '⚠️', color: '#E17055' },
            { label: 'Ticket Buka', value: data?.openTickets, icon: '🎫', color: '#74B9FF' },
          ].map((w, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon">{w.icon}</div>
              <div className="stat-value">{w.value}</div>
              <div className="stat-label">{w.label}</div>
            </div>
          ))}
        </div>

        {/* ===== ROW 3: Chart + Top Products ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* Revenue Chart (Bar) */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-secondary)', padding: '24px', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>📊 Revenue 30 Hari Terakhir</h3>
            <div ref={chartScrollRef} className="custom-scrollbar" style={{ overflowX: 'auto', paddingBottom: '16px', scrollbarWidth: 'thin' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '180px', minWidth: '900px' }}>
                {data?.dailyRevenue.map((d, i) => (
                  <div key={i} style={{ flex: 1, minWidth: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {d.orders > 0 ? formatPrice(d.revenue) : '-'}
                    </div>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '48px',
                        height: `${maxRevenue > 0 ? Math.max((d.revenue / maxRevenue) * 140, d.revenue > 0 ? 8 : 3) : 3}px`,
                        background: d.revenue > 0 ? 'var(--accent)' : 'var(--border-secondary)',
                        borderRadius: '6px 6px 2px 2px',
                        transition: 'height 0.5s ease',
                      }}
                    />
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                      {d.date.split(' ').slice(0, 2).join(' ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-secondary)', padding: '24px', boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>🏆 Produk Terlaris</h3>
            {(data?.topProducts || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Belum ada data penjualan.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data?.topProducts.map((p, i) => {
                  const maxProdRevenue = data?.topProducts[0]?.revenue || 1;
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} {p.name}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--brand-success)', fontWeight: 600 }}>
                          {formatPrice(p.revenue)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--border-secondary)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${(p.revenue / maxProdRevenue) * 100}%`,
                            height: '100%',
                            borderRadius: '3px',
                            background: i === 0 ? 'var(--accent)' : i === 1 ? '#60a5fa' : '#93c5fd',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '50px', textAlign: 'right' }}>{p.count} sold</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ===== ROW 4: Order Status Breakdown + Recent Orders ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>

          {/* Order Status Donut-style */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-secondary)', padding: '24px', boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>📋 Status Pesanan</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(data?.statusBreakdown || {}).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                const total = data?.totalOrders || 1;
                const pct = Math.round((count / total) * 100);
                const colors: Record<string, string> = {
                  pending: '#71717a', paid: '#3b82f6', assigned: '#8b5cf6',
                  delivered: '#22c55e', completed: '#22c55e', cancelled: '#ef4444', refunded: '#eab308',
                };
                return (
                  <div key={status}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: colors[status] || '#636e72', display: 'inline-block' }} />
                        {getStatusLabel(status)}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: '5px', borderRadius: '3px', background: 'var(--border-secondary)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: colors[status] || '#636e72', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                );
              })}
              {Object.keys(data?.statusBreakdown || {}).length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Belum ada pesanan.</p>
              )}
            </div>
          </div>

          {/* Recent Orders */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-secondary)', padding: '24px', boxShadow: 'var(--shadow-md)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '20px' }}>🕐 Pesanan Terbaru</h3>
            <div className="table-container" style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Buyer</th>
                    <th>Produk</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentOrders || []).map((o: any) => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--brand-primary-light)' }}>{o.order_number}</td>
                      <td style={{ fontSize: '0.85rem' }}>{o.buyer?.name || '-'}</td>
                      <td style={{ fontSize: '0.85rem' }}>{o.product?.name || '-'}</td>
                      <td style={{ color: 'var(--brand-success)', fontWeight: 600, fontSize: '0.85rem' }}>{formatPrice(o.total_amount)}</td>
                      <td><span className={`badge ${getStatusBadge(o.order_status)}`} style={{ fontSize: '0.7rem' }}>{o.order_status}</span></td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                  {(data?.recentOrders || []).length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada pesanan</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
