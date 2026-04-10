'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { adminRpc } from '@/lib/adminApi';
import { Order } from '@/lib/types';

const ITEMS_PER_PAGE = 15;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [syncing, setSyncing] = useState(false);

  // Feature 4: Search & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => { loadOrders(); }, []);

  async function handleSyncPakasir() {
    if (!confirm('Sync semua order pending dengan Pakasir?\n\nIni akan mengecek setiap order yang belum bayar ke Pakasir, dan mengupdate yang sudah completed.')) return;
    setSyncing(true);
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch('/api/admin/sync-pakasir', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Sync selesai!\n\n${data.message}\n\nDetail:\n${data.details?.map((d: { order_number: string; status: string }) => `• ${d.order_number}: ${d.status}`).join('\n') || '-'}`);
        loadOrders();
      } else {
        alert('Error: ' + (data.error || 'Unknown'));
      }
    } catch {
      alert('Terjadi kesalahan jaringan');
    }
    setSyncing(false);
  }

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, buyer:buyers(*), product:products(*)')
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  }

  async function handleManualAssign(order: Order) {
    setAssigningOrderId(order.id);
    const result = await adminRpc('assign_account_for_order', { p_order_id: order.id });
    
    if (result.error) {
      alert('Error: ' + result.error.message);
      setAssigningOrderId(null);
      return;
    }
    const data = result.data;
    if (data && !data.success) {
      alert('Gagal: ' + (data.error || 'Tidak ada stok tersedia'));
      setAssigningOrderId(null);
      return;
    }

    await loadOrders();

    const buyer = order.buyer as unknown as { phone?: string };
    if (buyer?.phone) {
      await sendWA(order);
    } else {
      alert('Berhasil di-assign, tapi buyer tidak punya nomor WhatsApp untuk dikirim pesan.');
    }

    setAssigningOrderId(null);
    setSelectedOrder(null);
  }

  async function sendWA(order: Order) {
    const buyer = order.buyer as unknown as { name: string; phone: string };
    const product = order.product as unknown as { name: string; duration_days: number; account_type: string };

    try {
      const { data: assignment, error: assignErr } = await supabase
        .from('account_assignments')
        .select('*, stock_account:stock_accounts(*)')
        .eq('order_id', order.id)
        .eq('status', 'active')
        .single();

      if (assignErr || !assignment) {
        alert('Berhasil di-assign, namun gagal membuka WhatsApp. Gunakan tombol "Kirim WA" secara manual.');
        return;
      }

      const res = await fetch('/api/buyer/decrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encrypted: assignment.stock_account.account_secret_encrypted }),
      });
      const decData = await res.json();
      const password = decData.decrypted || 'Gagal-Dekripsi';
      const sa = assignment.stock_account;

      const isSharing = product.account_type === 'sharing';
      const catatan = isSharing
        ? `\n_⚠️ Catatan (Akun Sharing):_\n*DILARANG* mengubah password, email, atau profil akun. Akun ini digunakan bersama — pelanggaran akan mengakibatkan akun diblokir tanpa pengembalian dana.`
        : `\n_📌 Info (Akun Private):_\nAkun ini sepenuhnya milik Anda. Namun jika Anda *mengganti password*, garansi akun otomatis *hangus*. Kami sarankan untuk tidak mengubah sandi selama masa aktif.`;

      const text = `Halo *${buyer.name}*,\nPesanan Anda telah dikonfirmasi! ✅\n\nBerikut detail akun untuk produk *${product.name}*:\n\n` +
        `👤 *Email/User:* ${sa.account_identifier}\n` +
        `🔑 *Password:* ${password}\n` +
        (sa.profile_info ? `👤 *Profil:* ${sa.profile_info}\n` : '') +
        (sa.pin_info ? `🔐 *PIN:* ${sa.pin_info}\n` : '') +
        `\n⏳ *Masa Aktif:* ${product.duration_days} hari\n` +
        `${catatan}\n\nTerima kasih telah berbelanja di *pastipremium.store*! 🙏`;

      let phone = buyer.phone.replace(/[^0-9]/g, '');
      if (phone.startsWith('0')) phone = '62' + phone.substring(1);

      const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
      window.open(waLink, '_blank');
    } catch {
      alert('Berhasil di-assign, namun gagal membuka WhatsApp. Gunakan tombol "Kirim WA" secara manual.');
    }
  }

  async function handleApprovePayment(order: Order) {
    if (!confirm(`Konfirmasi pembayaran untuk order ${order.order_number}?\n\nIni akan:\n1. Mengubah status menjadi PAID\n2. Otomatis assign akun ke buyer\n3. Auto-delivery langsung aktif`)) return;

    try {
      const res = await fetch('/api/payments/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_number: order.order_number,
          gateway_name: 'admin_override',
          gateway_reference: 'MANUAL-' + Date.now(),
          amount: order.total_amount,
          status: 'success',
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Pembayaran dikonfirmasi! Auto-delivery berhasil.');
        loadOrders();
      } else {
        alert('Error: ' + (data.error || 'Unknown'));
      }
    } catch {
      alert('Terjadi kesalahan jaringan');
    }
  }



  function formatPrice(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      pending: 'badge-neutral', paid: 'badge-info', assigned: 'badge-primary',
      delivered: 'badge-success', completed: 'badge-success', cancelled: 'badge-danger',
      refunded: 'badge-warning', pending_payment: 'badge-neutral', failed: 'badge-danger',
    };
    return map[status] || 'badge-neutral';
  }

  // Feature 4: Enhanced filtering with search
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Status filter
    if (filterStatus === 'all') {
      result = result.filter(o => o.payment_status !== 'pending_payment');
    } else {
      result = result.filter(o => o.payment_status === filterStatus || o.order_status === filterStatus);
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(o =>
        o.order_number.toLowerCase().includes(q) ||
        (o.buyer as unknown as { name: string })?.name?.toLowerCase().includes(q) ||
        (o.buyer as unknown as { phone: string })?.phone?.toLowerCase().includes(q) ||
        (o.product as unknown as { name: string })?.name?.toLowerCase().includes(q)
      );
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let cutoff = new Date();
      if (dateFilter === 'today') {
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateFilter === '7days') {
        cutoff.setDate(now.getDate() - 7);
      } else if (dateFilter === '30days') {
        cutoff.setDate(now.getDate() - 30);
      }
      result = result.filter(o => new Date(o.created_at) >= cutoff);
    }

    return result;
  }, [orders, filterStatus, searchQuery, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, searchQuery, dateFilter]);



  return (
    <div className="admin-content">
      <div className="admin-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Pesanan</h2>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleSyncPakasir}
          disabled={syncing}
          style={{ fontSize: '0.8rem', gap: '6px', display: 'flex', alignItems: 'center' }}
        >
          {syncing ? <><span className="loading-spinner" style={{ width: '14px', height: '14px' }} /> Syncing...</> : '🔄 Sync Pakasir'}
        </button>
      </div>
      <div style={{ padding: '32px' }}>
        {/* Search & Date Filter */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-lg)', padding: '16px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 280px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                🔍 Cari Pesanan
              </label>
              <input
                className="form-input"
                placeholder="Cari order number, nama buyer, produk, no. WA..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ height: '36px', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ flex: '0 0 160px' }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                Periode
              </label>
              <select className="form-select" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ height: '36px', fontSize: '0.85rem' }}>
                <option value="all">Semua Waktu</option>
                <option value="today">Hari Ini</option>
                <option value="7days">7 Hari Terakhir</option>
                <option value="30days">30 Hari Terakhir</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Menampilkan {paginatedOrders.length} dari {filteredOrders.length} pesanan
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Semua', count: orders.filter(o => o.payment_status !== 'pending_payment').length },
            { key: 'pending_payment', label: 'Belum Bayar', count: orders.filter(o => o.payment_status === 'pending_payment').length },
            { key: 'paid', label: 'Sudah Bayar', count: orders.filter(o => o.payment_status === 'paid').length },
            { key: 'delivered', label: 'Terkirim', count: orders.filter(o => o.order_status === 'delivered').length },
          ].map(f => (
            <button
              key={f.key}
              className={`btn btn-sm ${filterStatus === f.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterStatus(f.key)}
              style={{ fontSize: '0.8rem' }}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Buyer</th>
                    <th>Produk</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Tanggal</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'monospace', color: 'var(--brand-primary-light)' }}>{o.order_number}</td>
                      <td style={{ color: 'var(--text-primary)' }}>{(o.buyer as unknown as { name: string })?.name || '-'}</td>
                      <td>{(o.product as unknown as { name: string })?.name || '-'}</td>
                      <td style={{ color: 'var(--brand-success)' }}>{formatPrice(o.total_amount)}</td>
                      <td><span className={`badge ${getStatusBadge(o.payment_status)}`}>{o.payment_status}</span></td>
                      <td><span className={`badge ${getStatusBadge(o.order_status)}`}>{o.order_status}</span></td>
                      <td style={{ fontSize: '0.8rem' }}>{new Date(o.created_at).toLocaleString('id-ID')}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedOrder(o)}>Detail</button>
                          
                          {o.payment_status === 'pending_payment' && (
                            <button className="btn btn-success btn-sm" onClick={() => handleApprovePayment(o)}>✅ Konfirmasi</button>
                          )}
                          {o.payment_status === 'paid' && o.order_status === 'paid' && (
                            <button className="btn btn-sm" style={{ backgroundColor: '#25D366', color: '#fff', border: 'none', fontWeight: 600 }} onClick={() => handleManualAssign(o)} disabled={assigningOrderId !== null}>
                              {assigningOrderId === o.id ? <span className="loading-spinner" style={{ width: '14px', height: '14px' }} /> : '📞 Assign & Kirim WA'}
                            </button>
                          )}
                          {(o.order_status === 'assigned' || o.order_status === 'delivered') && (
                            <button className="btn btn-sm" style={{ backgroundColor: '#25D366', color: '#fff', border: 'none', fontWeight: 600 }} onClick={() => sendWA(o)}>
                              📞 Kirim Ulang WA
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedOrders.length === 0 && (
                    <tr><td colSpan={8} className="empty-state"><div className="icon">🛒</div><h3>{searchQuery ? 'Tidak ada hasil pencarian' : 'Tidak ada pesanan'}</h3></td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                gap: '8px', marginTop: '20px', flexWrap: 'wrap',
              }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  style={{ fontSize: '0.8rem' }}
                >
                  «
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={{ fontSize: '0.8rem' }}
                >
                  ‹ Prev
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    if (page === 1 || page === totalPages) return true;
                    if (Math.abs(page - currentPage) <= 2) return true;
                    return false;
                  })
                  .map((page, idx, arr) => {
                    const showEllipsis = idx > 0 && page - arr[idx - 1] > 1;
                    return (
                      <span key={page}>
                        {showEllipsis && <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>…</span>}
                        <button
                          className={`btn btn-sm ${currentPage === page ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setCurrentPage(page)}
                          style={{ fontSize: '0.8rem', minWidth: '36px' }}
                        >
                          {page}
                        </button>
                      </span>
                    );
                  })}

                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={{ fontSize: '0.8rem' }}
                >
                  Next ›
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  style={{ fontSize: '0.8rem' }}
                >
                  »
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Detail Pesanan {selectedOrder.order_number}</h3>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div><span className="form-label">Buyer:</span> <span style={{ color: 'var(--text-primary)' }}>{(selectedOrder.buyer as unknown as { name: string })?.name}</span></div>
              <div><span className="form-label">Phone:</span> <span style={{ color: 'var(--text-primary)' }}>{(selectedOrder.buyer as unknown as { phone: string })?.phone}</span></div>
              <div><span className="form-label">Produk:</span> <span style={{ color: 'var(--text-primary)' }}>{(selectedOrder.product as unknown as { name: string })?.name}</span></div>
              <div><span className="form-label">Total:</span> <span style={{ color: 'var(--brand-success)', fontWeight: 700 }}>{formatPrice(selectedOrder.total_amount)}</span></div>
              <div><span className="form-label">Payment:</span> <span className={`badge ${getStatusBadge(selectedOrder.payment_status)}`}>{selectedOrder.payment_status}</span></div>
              <div><span className="form-label">Order Status:</span> <span className={`badge ${getStatusBadge(selectedOrder.order_status)}`}>{selectedOrder.order_status}</span></div>
              {selectedOrder.paid_at && <div><span className="form-label">Paid At:</span> {new Date(selectedOrder.paid_at).toLocaleString('id-ID')}</div>}
              {selectedOrder.delivered_at && <div><span className="form-label">Delivered At:</span> {new Date(selectedOrder.delivered_at).toLocaleString('id-ID')}</div>}
              

            </div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setSelectedOrder(null)}>Tutup</button></div>
          </div>
        </div>
      )}


    </div>
  );
}
