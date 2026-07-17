'use client';

import { useState, useEffect } from 'react';
import { adminSelect, adminUpdate } from '@/lib/adminApi';

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadBuyers(); }, []);

  async function loadBuyers() {
    const { data } = await adminSelect('buyers');
    setBuyers((data || []).sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    ));
    setLoading(false);
  }

  function handleExportWA() {
    const numbers = buyers
      .map(b => b.phone as string)
      .filter(p => !!p && p.trim().length >= 9) // basic check for valid-ish length
      .map(phone => {
        let cleaned = phone.replace(/\D/g, ''); // Remove non-numeric
        if (cleaned.startsWith('0')) {
          cleaned = '62' + cleaned.substring(1);
        } else if (cleaned.startsWith('+62')) {
          cleaned = '62' + cleaned.substring(3);
        } else if (cleaned.startsWith('8')) {
          cleaned = '62' + cleaned;
        }
        return cleaned;
      });

    const uniqueNumbers = Array.from(new Set(numbers));

    if (uniqueNumbers.length === 0) {
      alert('Tidak ada nomor WA yang tersedia.');
      return;
    }

    const textContent = uniqueNumbers.join('\n');
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp_buyers_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <h2>Buyers</h2>
        <div className="admin-topbar-actions">
          <button 
            className="btn btn-success btn-sm" 
            onClick={handleExportWA}
            disabled={buyers.length === 0}
          >
            📋 Export WA (.txt)
          </button>
        </div>
      </div>
      <div style={{ padding: '32px' }}>
        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Nama</th><th>Phone</th><th>Status</th><th>Terdaftar</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {buyers.map(b => (
                  <tr key={b.id as number}>
                    <td style={{ fontFamily: 'monospace' }}>#{b.id as number}</td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{b.name as string}</td>
                    <td>{(b.phone as string) || '—'}</td>
                    <td><span className={`badge ${(b.status as string) === 'active' ? 'badge-success' : 'badge-danger'}`}>{b.status as string}</span></td>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(b.created_at as string).toLocaleDateString('id-ID')}</td>
                    <td>
                      <button
                        className={`btn btn-sm ${(b.status as string) === 'active' ? 'btn-danger' : 'btn-success'}`}
                        onClick={async () => {
                          const result = await adminUpdate('buyers', { status: (b.status as string) === 'active' ? 'blocked' : 'active', updated_at: new Date().toISOString() }, { id: b.id });
                          if (result.error) { alert('Gagal: ' + result.error.message); return; }
                          loadBuyers();
                        }}
                      >
                        {(b.status as string) === 'active' ? 'Block' : 'Aktifkan'}
                      </button>
                    </td>
                  </tr>
                ))}
                {buyers.length === 0 && (
                  <tr><td colSpan={6} className="empty-state"><div className="icon">👥</div><h3>Belum ada buyer</h3></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
