'use client';

import { useEffect, useState } from 'react';
import { adminSelect, adminUpdate } from '@/lib/adminApi';

type BuyerRow = Record<string, unknown>;

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<BuyerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => { void loadBuyers(); }, []);

  async function loadBuyers() {
    const { data } = await adminSelect('buyers');
    setBuyers((data || []).sort((a: BuyerRow, b: BuyerRow) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    ));
    setLoading(false);
  }

  async function handleBanToggle(buyer: BuyerRow) {
    const id = Number(buyer.id);
    const name = String(buyer.name || `Buyer #${id}`);
    const isBanned = buyer.status === 'blocked';
    const action = isBanned ? 'unban' : 'ban';
    const confirmation = isBanned
      ? `Buka kembali akses untuk ${name}?`
      : `Ban ${name}? Buyer akan langsung kehilangan akses pembelian, pesanan, dan data akun.`;

    if (!window.confirm(confirmation)) return;

    setUpdatingId(id);
    const result = await adminUpdate(
      'buyers',
      {
        status: isBanned ? 'active' : 'blocked',
        updated_at: new Date().toISOString(),
      },
      { id },
    );
    setUpdatingId(null);

    if (result.error) {
      alert(`Gagal melakukan ${action}: ${result.error.message}`);
      return;
    }

    await loadBuyers();
  }

  function handleExportWA() {
    const numbers = buyers
      .map(b => b.phone as string)
      .filter(p => !!p && p.trim().length >= 9)
      .map(phone => {
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
          cleaned = '62' + cleaned.substring(1);
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
        <div
          style={{
            marginBottom: '20px',
            padding: '16px 18px',
            borderRadius: '12px',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            background: 'rgba(239, 68, 68, 0.08)',
            color: 'var(--text-primary)',
            lineHeight: 1.6,
          }}
        >
          <strong>Fitur banned buyer:</strong> buyer yang diban akan melihat pemberitahuan
          pelanggaran ketentuan dan tidak dapat membeli, membayar, melihat pesanan, atau
          membuka data akun sampai di-unban.
        </div>

        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>ID</th><th>Nama</th><th>Phone</th><th>Status</th><th>Terdaftar</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {buyers.map(buyer => {
                  const id = Number(buyer.id);
                  const isBanned = buyer.status === 'blocked';
                  const isUpdating = updatingId === id;

                  return (
                    <tr key={id}>
                      <td style={{ fontFamily: 'monospace' }}>#{id}</td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(buyer.name || '—')}</td>
                      <td>{String(buyer.phone || '—')}</td>
                      <td>
                        <span className={`badge ${isBanned ? 'badge-danger' : 'badge-success'}`}>
                          {isBanned ? 'BANNED' : 'AKTIF'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {new Date(String(buyer.created_at)).toLocaleDateString('id-ID')}
                      </td>
                      <td>
                        <button
                          className={`btn btn-sm ${isBanned ? 'btn-success' : 'btn-danger'}`}
                          onClick={() => void handleBanToggle(buyer)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? 'Memproses...' : isBanned ? 'Unban' : 'Ban Buyer'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
