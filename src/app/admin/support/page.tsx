'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { adminUpdate } from '@/lib/adminApi';

export default function SupportPage() {
  const [tickets, setTickets] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTickets(); }, []);

  async function loadTickets() {
    const { data } = await supabase
      .from('support_tickets')
      .select('*, buyer:buyers(name, phone), order:orders(order_number)')
      .order('created_at', { ascending: false });
    setTickets(data || []);
    setLoading(false);
  }

  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      open: 'badge-danger', in_progress: 'badge-warning', resolved: 'badge-success', closed: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
  }

  return (
    <div className="admin-content">
      <div className="admin-topbar"><h2>Support Tickets</h2></div>
      <div className="admin-page-body" style={{ padding: '32px' }}>
        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Buyer</th><th>Order</th><th>Subjek</th><th>Status</th><th>Tanggal</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id as number}>
                    <td style={{ fontFamily: 'monospace' }}>#{t.id as number}</td>
                    <td style={{ color: 'var(--text-primary)' }}>
                      <div>{(t.buyer as Record<string, string>)?.name || '-'}</div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{(t.buyer as Record<string, string>)?.phone || ''}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{(t.order as Record<string, string>)?.order_number || '—'}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{t.subject as string}</td>
                    <td><span className={`badge ${getStatusBadge(t.status as string)}`}>{t.status as string}</span></td>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(t.created_at as string).toLocaleString('id-ID')}</td>
                    <td>
                      <select
                        className="form-select"
                        value={t.status as string}
                        style={{ padding: '4px 8px', fontSize: '0.75rem', width: 'auto' }}
                        onChange={async (e) => {
                          const admin = JSON.parse(localStorage.getItem('admin_session') || '{}');
                          const result = await adminUpdate('support_tickets', { status: e.target.value, handled_by_admin_id: admin.id, updated_at: new Date().toISOString() }, { id: t.id });
                          if (result.error) { alert('Gagal: ' + result.error.message); return; }
                          loadTickets();
                        }}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr><td colSpan={7} className="empty-state"><div className="icon">🎫</div><h3>Tidak ada ticket</h3></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
