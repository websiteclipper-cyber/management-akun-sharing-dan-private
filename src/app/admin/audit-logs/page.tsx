'use client';

import { useState, useEffect } from 'react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadLogs(); }, []);

  async function loadLogs() {
    try {
      const token = localStorage.getItem('admin_token') || '';
      const response = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setLogs(response.ok ? data.logs || [] : []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-content">
      <div className="admin-topbar"><h2>Audit Logs</h2></div>
      <div style={{ padding: '32px' }}>
        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Actor</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>Waktu</th></tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id as number}>
                    <td style={{ fontFamily: 'monospace' }}>#{l.id as number}</td>
                    <td>
                      <span className={`badge ${(l.actor_type as string) === 'admin' ? 'badge-primary' : 'badge-info'}`}>
                        {(l.actor_type as string) === 'admin' ? (l.admin as Record<string, string>)?.name || 'Admin' : 'SYSTEM'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{l.action as string}</td>
                    <td>{l.entity_type as string}</td>
                    <td style={{ fontFamily: 'monospace' }}>#{l.entity_id as number}</td>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(l.created_at as string).toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="empty-state"><div className="icon">📋</div><h3>Belum ada log</h3></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
