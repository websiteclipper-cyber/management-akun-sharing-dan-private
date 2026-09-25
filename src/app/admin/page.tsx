'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  FiAlertCircle, FiArrowRight, FiBox, FiBriefcase, FiCalendar,
  FiCheckCircle, FiChevronDown, FiClock, FiFilter, FiRefreshCw, FiSearch, FiX,
} from 'react-icons/fi';
import { SiGooglegemini, SiOpenai } from 'react-icons/si';
import styles from './dashboard.module.css';

interface RecentOrder {
  id: number;
  order_number: string;
  total_amount: number;
  order_status: string;
  payment_status?: string;
  created_at: string;
  buyer?: { name?: string | null; phone?: string | null } | null;
  product?: { name?: string | null; platform_name?: string | null } | null;
}

interface TopProduct {
  name: string;
  count: number;
  revenue: number;
}

interface SalesData {
  totalRevenue: number;
  totalOrders: number;
  totalBuyers: number;
  totalStockActive: number;
  revenueToday: number;
  ordersToday: number;
  paidToday: number;
  pendingPayment: number;
  needsAssignment: number;
  openTickets: number;
  totalActiveProducts: number;
  sharingAvailable: number;
  privateAvailable: number;
  fullAccounts: number;
  recentOrders: RecentOrder[];
  topProducts: TopProduct[];
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  statusBreakdown: Record<string, number>;
}

const statusLabels: Record<string, string> = {
  pending: 'Menunggu pembayaran', pending_payment: 'Belum bayar', paid: 'Perlu assignment',
  assigned: 'Diproses', delivered: 'Terkirim', completed: 'Selesai',
  cancelled: 'Dibatalkan', refunded: 'Dikembalikan', failed: 'Gagal',
};

const statusTones: Record<string, string> = {
  pending: 'blue', pending_payment: 'amber', paid: 'neutral', assigned: 'blue',
  delivered: 'green', completed: 'green', cancelled: 'red', refunded: 'amber', failed: 'red',
};

function formatPrice(price: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(price).replace(/\s/g, '');
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value);
}

function ProductIcon({ name }: { name: string }) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('gemini')) return <SiGooglegemini className={styles.geminiIcon} aria-hidden="true" />;
  if (lowerName.includes('business')) return <FiBriefcase aria-hidden="true" />;
  if (lowerName.includes('chatgpt') || lowerName.includes('openai')) return <SiOpenai aria-hidden="true" />;
  return <FiBox aria-hidden="true" />;
}

function RevenueChart({ days }: { days: SalesData['dailyRevenue'] }) {
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const width = 640;
  const height = 210;
  const left = 70;
  const right = 16;
  const top = 18;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const highestRevenue = Math.max(1, ...days.map(day => day.revenue));
  const magnitude = 10 ** Math.floor(Math.log10(highestRevenue));
  const maximum = Math.ceil(highestRevenue / magnitude) * magnitude;
  const points = days.map((day, index) => ({
    x: left + (days.length === 1 ? plotWidth / 2 : (index / (days.length - 1)) * plotWidth),
    y: top + plotHeight - (day.revenue / maximum) * plotHeight,
  }));
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const selectedDay = activePoint === null ? undefined : days[activePoint];
  const selectedPoint = activePoint === null ? undefined : points[activePoint];

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartTooltip} aria-live="polite">
        {selectedDay ? <><strong>{selectedDay.date}</strong><span>{formatPrice(selectedDay.revenue)} · {formatNumber(selectedDay.orders)} pesanan</span></> : <span>Pendapatan dari pesanan yang sudah dibayar</span>}
      </div>
      <div className={styles.chartScroll}>
        <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Grafik pendapatan harian. Pilih titik untuk melihat pendapatan dan jumlah pesanan.">
          <defs>
            <linearGradient id="dashboard-revenue-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#18181b" stopOpacity=".12" />
              <stop offset="100%" stopColor="#18181b" stopOpacity=".025" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map(tick => {
            const y = top + (tick / 3) * plotHeight;
            const amount = maximum * (1 - tick / 3);
            return (
              <g key={tick}>
                <line x1={left} x2={width - right} y1={y} y2={y} className={styles.gridLine} />
                <text x={left - 10} y={y + 4} textAnchor="end" className={styles.axisLabel}>{formatNumber(Math.round(amount))}</text>
              </g>
            );
          })}
          {points.map((point, index) => (
            <line key={index} x1={point.x} x2={point.x} y1={top} y2={height - bottom} className={styles.gridLine} />
          ))}
          {points.length > 0 && <polygon points={`${left},${height - bottom} ${line} ${points[points.length - 1].x},${height - bottom}`} fill="url(#dashboard-revenue-fill)" />}
          <polyline points={line} fill="none" stroke="#27272a" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
          {selectedPoint && <line x1={selectedPoint.x} x2={selectedPoint.x} y1={top} y2={height - bottom} stroke="#a1a1aa" strokeDasharray="3 4" />}
          {days.map((day, index) => {
            const point = points[index];
            const showLabel = index % Math.ceil(days.length / 7) === 0 || index === days.length - 1;
            return (
              <g key={day.date}>
                <circle cx={point.x} cy={point.y} r={activePoint === index ? 4 : 2.6} fill="#27272a" />
                <circle cx={point.x} cy={point.y} r="9" fill="transparent" tabIndex={0} role="button"
                  aria-label={`${day.date}: ${formatPrice(day.revenue)}, ${day.orders} pesanan`}
                  onMouseEnter={() => setActivePoint(index)} onMouseLeave={() => setActivePoint(null)}
                  onFocus={() => setActivePoint(index)} onBlur={() => setActivePoint(null)}
                  onClick={() => setActivePoint(index)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActivePoint(index); } }}
                ><title>{day.date}: {formatPrice(day.revenue)} · {day.orders} pesanan</title></circle>
                {showLabel && <text x={point.x} y={height - 10} textAnchor={index === days.length - 1 ? 'end' : 'middle'} className={styles.axisLabel}>{day.date.replace(/^[^\d]*/, '')}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expiringLoading, setExpiringLoading] = useState(false);
  const [chartDays, setChartDays] = useState(30);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderTab, setOrderTab] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [orderDate, setOrderDate] = useState('all');

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
    setLoadError('');
    try {
      const token = localStorage.getItem('admin_token') || '';
      const response = await fetch('/api/admin/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Dashboard gagal dimuat. Silakan coba lagi.');
      setData(await response.json() as SalesData);
    } catch {
      setLoadError('Dashboard gagal dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDashboard(); }, []);

  if (loading) {
    return <div className={styles.loading} role="status"><div className="loading-spinner" /><p>Memuat dashboard...</p></div>;
  }

  if (!data) {
    return <div className={styles.loading} role="alert"><FiAlertCircle size={28} /><p>{loadError || 'Data dashboard belum tersedia.'}</p><button className={styles.button} onClick={() => { setLoading(true); void loadDashboard(); }}><FiRefreshCw /> Coba lagi</button></div>;
  }

  const breakdown = data.statusBreakdown;
  const hasTasks = data.needsAssignment + data.pendingPayment + data.openTickets > 0;
  const today = new Date();
  const tabs = [
    { id: 'all', label: 'Semua', count: data.totalOrders },
    { id: 'paid', label: 'Perlu assignment', count: data.needsAssignment },
    { id: 'pending', label: 'Belum bayar', count: data.pendingPayment },
    { id: 'assigned', label: 'Diproses', count: breakdown.assigned || 0 },
    { id: 'completed', label: 'Selesai', count: (breakdown.completed || 0) + (breakdown.delivered || 0) },
    { id: 'cancelled', label: 'Dibatalkan', count: breakdown.cancelled || 0 },
  ];
  const visibleOrders = data.recentOrders.filter(order => {
    const matchesTab = orderTab === 'all'
      || (orderTab === 'pending' ? order.payment_status === 'pending_payment'
        : orderTab === 'paid' ? order.order_status === 'paid' && order.payment_status === 'paid'
        : orderTab === 'completed' ? ['completed', 'delivered'].includes(order.order_status)
        : order.order_status === orderTab);
    const query = orderSearch.trim().toLowerCase();
    const matchesSearch = [order.order_number, order.buyer?.name, order.buyer?.phone, order.product?.name].some(value => value?.toLowerCase().includes(query));
    const createdAt = new Date(order.created_at);
    const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    const matchesDate = orderDate === 'all' || (orderDate === 'today' ? createdAt.toDateString() === today.toDateString() : createdAt >= weekStart);
    return matchesTab && matchesSearch && matchesDate;
  });

  return (
    <div className={styles.dashboard}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>OVERVIEW / ADMIN</p>
        <h1>Dashboard</h1>
        <p className={styles.date}><FiCalendar aria-hidden="true" />{today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<span>Ringkasan bisnis Anda</span></p>
      </header>

      {loadError && <div className={styles.error} role="alert"><FiAlertCircle />{loadError}<button onClick={() => void loadDashboard()}>Coba lagi</button></div>}

      <section className={styles.summary} aria-label="Ringkasan penjualan">
        {[
          { label: 'Total pendapatan', value: formatPrice(data.totalRevenue), hint: `${formatNumber(data.totalOrders)} total pesanan` },
          { label: 'Pendapatan hari ini', value: formatPrice(data.revenueToday), hint: `${formatNumber(data.paidToday)} pesanan lunas hari ini` },
          { label: 'Total pembeli', value: formatNumber(data.totalBuyers), hint: `${formatNumber(data.ordersToday)} pesanan hari ini` },
          { label: 'Stok aktif', value: formatNumber(data.totalStockActive), hint: `${formatNumber(data.totalActiveProducts)} produk aktif` },
        ].map(stat => <div className={styles.metric} key={stat.label} title={stat.hint}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
      </section>

      <section className={`${styles.taskBanner} ${!hasTasks ? styles.taskBannerClear : ''}`} aria-label="Tugas yang perlu ditangani">
        <span className={styles.taskIntro}>{hasTasks ? <FiAlertCircle /> : <FiCheckCircle />}<strong>{hasTasks ? 'Ada tugas yang perlu ditangani:' : 'Semua tugas sudah tertangani'}</strong></span>
        <div className={styles.taskLinks}>
          <Link href="/admin/orders"><b>{formatNumber(data.needsAssignment)}</b> Perlu assignment</Link>
          <Link href="/admin/orders"><b>{formatNumber(data.pendingPayment)}</b> Belum bayar</Link>
          <Link href="/admin/support"><b>{formatNumber(data.openTickets)}</b> Tiket terbuka</Link>
        </div>
        <Link className={styles.taskArrow} href="/admin/orders" aria-label="Buka pengelolaan pesanan"><FiArrowRight /></Link>
      </section>

      <div className={styles.analyticsGrid}>
        <section className={styles.panel} aria-labelledby="revenue-heading">
          <div className={styles.panelHeader}>
            <div><h2 id="revenue-heading">Pendapatan</h2><p>{chartDays} hari terakhir</p></div>
            <label className={styles.chartSelect}><span className={styles.srOnly}>Rentang grafik pendapatan</span><select value={chartDays} onChange={event => setChartDays(Number(event.target.value))}><option value={30}>30 hari</option><option value={7}>7 hari</option></select><FiChevronDown aria-hidden="true" /></label>
          </div>
          {data.dailyRevenue.length ? <RevenueChart key={chartDays} days={data.dailyRevenue.slice(-chartDays)} /> : <p className={styles.empty}>Belum ada data pendapatan.</p>}
        </section>

        <section className={styles.panel} aria-labelledby="products-heading">
          <div className={styles.panelHeader}><h2 id="products-heading">Produk terlaris</h2><Link className={styles.textLink} href="/admin/products">Lihat semua produk <FiArrowRight /></Link></div>
          <div className={`${styles.tableScroll} ${styles.productsScroll}`}>
            <table className={styles.productsTable}>
              <thead><tr><th scope="col">#</th><th scope="col">Produk</th><th scope="col">Terjual</th><th scope="col">Pendapatan</th></tr></thead>
              <tbody>
                {data.topProducts.map((product, index) => <tr key={`${product.name}-${index}`}><td>{index + 1}</td><td><span className={styles.product}><ProductIcon name={product.name} /><span>{product.name}</span></span></td><td>{formatNumber(product.count)}</td><td>{formatPrice(product.revenue)}</td></tr>)}
                {!data.topProducts.length && <tr><td colSpan={4} className={styles.empty}>Belum ada data penjualan.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className={`${styles.panel} ${styles.ordersPanel}`} aria-labelledby="orders-heading">
        <div className={styles.panelHeader}>
          <h2 id="orders-heading">Daftar pesanan</h2>
          <div className={styles.orderTools}>
            <label className={styles.orderSearch}><FiSearch aria-hidden="true" /><input aria-label="Cari pesanan terbaru" placeholder="Cari nomor, pembeli, produk..." value={orderSearch} onChange={event => setOrderSearch(event.target.value)} />{orderSearch && <button onClick={() => setOrderSearch('')} aria-label="Hapus pencarian"><FiX /></button>}</label>
            <button className={`${styles.button} ${showFilters || orderDate !== 'all' ? styles.buttonActive : ''}`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="dashboard-order-filters"><FiFilter />Filter{orderDate !== 'all' && <span className={styles.filterDot} />}</button>
          </div>
        </div>
        {showFilters && <div className={styles.filterRow} id="dashboard-order-filters"><label>Tanggal pesanan<select value={orderDate} onChange={event => setOrderDate(event.target.value)}><option value="all">Semua tanggal</option><option value="today">Hari ini</option><option value="week">7 hari terakhir</option></select></label><button onClick={() => { setOrderDate('all'); setOrderSearch(''); setOrderTab('all'); }}>Reset filter</button></div>}
        <div className={styles.tabs} role="group" aria-label="Filter status pesanan">
          {tabs.map(tab => <button key={tab.id} className={orderTab === tab.id ? styles.activeTab : ''} aria-pressed={orderTab === tab.id} onClick={() => setOrderTab(tab.id)}>{tab.label}<span>{formatNumber(tab.count)}</span></button>)}
        </div>
        <div className={`${styles.tableScroll} ${styles.ordersScroll}`}>
          <table className={styles.ordersTable}>
            <thead><tr><th scope="col"># Pesanan</th><th scope="col">Tanggal</th><th scope="col">Produk</th><th scope="col">Pembeli</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead>
            <tbody>
              {visibleOrders.map(order => <tr key={order.id}>
                <td className={styles.orderNumber}>{order.order_number}</td>
                <td className={styles.orderDate}>{new Date(order.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td><span className={styles.product}><ProductIcon name={order.product?.name || ''} /><span>{order.product?.name || '—'}</span></span></td>
                <td>{order.buyer?.name || '—'}</td>
                <td className={styles.amount}>{formatPrice(order.total_amount)}</td>
                <td><span className={styles.statusBadge} data-tone={statusTones[order.order_status] || 'neutral'}>{statusLabels[order.order_status] || order.order_status}</span></td>
                <td><Link className={styles.orderAction} href="/admin/orders" aria-label={`Kelola pesanan ${order.order_number}`} title="Buka pengelolaan pesanan"><FiArrowRight /></Link></td>
              </tr>)}
              {!visibleOrders.length && <tr><td colSpan={7} className={styles.empty}>{data.recentOrders.length ? 'Tidak ada pesanan terbaru yang cocok dengan filter.' : 'Belum ada pesanan.'}{(orderSearch || orderTab !== 'all' || orderDate !== 'all') && <button onClick={() => { setOrderSearch(''); setOrderTab('all'); setOrderDate('all'); }}>Reset pencarian & filter</button>}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className={styles.tableFooter}><span>Menampilkan {visibleOrders.length} dari {data.recentOrders.length} pesanan terbaru. Angka status mencakup semua pesanan.</span><Link className={styles.textLink} href="/admin/orders">Lihat semua pesanan <FiArrowRight /></Link></div>
      </section>

      <div className={styles.detailsGrid}>
        <section className={styles.panel} aria-labelledby="stock-heading">
          <div className={styles.panelHeader}><h2 id="stock-heading">Ringkasan stok</h2><Link className={styles.textLink} href="/admin/stock-accounts">Kelola stok <FiArrowRight /></Link></div>
          <dl className={styles.stockStats}>{[
            { label: 'Produk aktif', value: data.totalActiveProducts },
            { label: 'Akun sharing', value: data.sharingAvailable },
            { label: 'Akun private', value: data.privateAvailable },
            { label: 'Akun penuh', value: data.fullAccounts },
          ].map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{formatNumber(stat.value)}</dd></div>)}</dl>
        </section>
        <section className={styles.panel} aria-labelledby="status-heading">
          <div className={styles.panelHeader}><h2 id="status-heading">Status pesanan</h2><span className={styles.muted}>{formatNumber(data.totalOrders)} total</span></div>
          <div className={styles.statusOverview}>{Object.entries(breakdown).sort((a, b) => b[1] - a[1]).map(([status, count]) => <div key={status}><span className={styles.statusDot} data-tone={statusTones[status] || 'neutral'} /><span>{statusLabels[status] || status}</span><strong>{formatNumber(count)}</strong><small>{Math.round(count / (data.totalOrders || 1) * 100)}%</small></div>)}{!Object.keys(breakdown).length && <p className={styles.empty}>Belum ada pesanan.</p>}</div>
        </section>
      </div>

      <footer className={styles.dashboardFooter}>
        <p><span className={styles.liveDot} />{formatNumber(data.ordersToday)} pesanan hari ini<span className={styles.footerDivider}>/</span>{formatNumber(data.paidToday)} sudah dibayar</p>
        <div className={styles.footerActions}>
          <button className={styles.button} onClick={() => { setLoading(true); void loadDashboard(); }}><FiRefreshCw />Refresh</button>
          <button className={styles.button} onClick={handleAutoExpire} disabled={expiringLoading}>{expiringLoading ? <FiRefreshCw className={styles.spinning} /> : <FiClock />}{expiringLoading ? 'Memproses...' : 'Run Auto-Expire'}</button>
        </div>
      </footer>
    </div>
  );
}
