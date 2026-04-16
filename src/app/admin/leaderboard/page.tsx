'use client';

import { useState, useEffect, useCallback } from 'react';

interface LeaderboardEntry {
  id: number;
  mitra_name: string;
  commission_today: number;
  rank_position: number;
  avatar_emoji: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const EMOJI_OPTIONS = ['🤝', '🏆', '⭐', '💎', '🔥', '🚀', '👑', '🎯', '💪', '🌟', '🎖️', '🥇'];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<LeaderboardEntry | null>(null);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    mitra_name: '',
    commission_today: '',
    rank_position: '',
    avatar_emoji: '🤝',
    is_active: true,
  });

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch('/api/admin/leaderboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  function resetForm() {
    setForm({ mitra_name: '', commission_today: '', rank_position: '', avatar_emoji: '🤝', is_active: true });
    setEditEntry(null);
    setShowForm(false);
  }

  function openCreate() {
    resetForm();
    setForm(f => ({ ...f, rank_position: String((entries.length || 0) + 1) }));
    setShowForm(true);
  }

  function openEdit(entry: LeaderboardEntry) {
    setEditEntry(entry);
    setForm({
      mitra_name: entry.mitra_name,
      commission_today: String(entry.commission_today),
      rank_position: String(entry.rank_position),
      avatar_emoji: entry.avatar_emoji,
      is_active: entry.is_active,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('admin_token') || '';
      const method = editEntry ? 'PUT' : 'POST';
      const body = {
        ...(editEntry ? { id: editEntry.id } : {}),
        mitra_name: form.mitra_name.trim(),
        commission_today: Number(form.commission_today) || 0,
        rank_position: Number(form.rank_position) || 1,
        avatar_emoji: form.avatar_emoji,
        is_active: form.is_active,
      };

      const res = await fetch('/api/admin/leaderboard', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage(`✅ ${editEntry ? 'Data berhasil diupdate!' : 'Mitra berhasil ditambahkan!'}`);
        resetForm();
        loadEntries();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await res.json();
        setMessage('❌ Error: ' + (data.error || 'Unknown'));
      }
    } catch {
      setMessage('❌ Terjadi kesalahan jaringan');
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm('Yakin ingin menghapus mitra ini dari leaderboard?')) return;

    try {
      const token = localStorage.getItem('admin_token') || '';
      const res = await fetch(`/api/admin/leaderboard?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessage('✅ Mitra berhasil dihapus!');
        loadEntries();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch {
      setMessage('❌ Gagal menghapus');
    }
  }

  async function toggleActive(entry: LeaderboardEntry) {
    try {
      const token = localStorage.getItem('admin_token') || '';
      await fetch('/api/admin/leaderboard', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: entry.id, is_active: !entry.is_active }),
      });
      loadEntries();
    } catch {
      // silently fail
    }
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  }

  return (
    <div className="admin-content">
      <div className="admin-topbar">
        <h2>🏆 Leaderboard Mitra (Dummy)</h2>
        <div className="admin-topbar-actions">
          <button className="btn btn-primary" onClick={openCreate}>
            + Tambah Mitra Dummy
          </button>
        </div>
      </div>

      <div style={{ padding: '28px' }}>
        {/* Info Box */}
        <div style={{
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#eab308', marginBottom: '6px' }}>
            ⚡ Apa itu Leaderboard Dummy?
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Data di bawah ini bukan perolehan komisi riil. Ini adalah data <strong>fiktif</strong> yang
            akan ditampilkan di halaman utama website sebagai &quot;Leaderboard Komisi Hari Ini&quot;
            untuk menarik minat calon mitra baru. Anda bisa mengatur nama, jumlah komisi, dan ranking sesuka hati.
          </p>
        </div>

        {/* Status message */}
        {message && (
          <div style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: message.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${message.startsWith('✅') ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            color: message.startsWith('✅') ? '#22c55e' : '#ef4444',
            fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px',
          }}>
            {message}
          </div>
        )}

        {/* Modal Form */}
        {showForm && (
          <div className="modal-overlay" onClick={() => resetForm()}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <h3 className="modal-title">
                {editEntry ? '✏️ Edit Mitra Dummy' : '➕ Tambah Mitra Dummy'}
              </h3>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Nama Mitra</label>
                  <input
                    className="form-input"
                    value={form.mitra_name}
                    onChange={e => setForm({ ...form, mitra_name: e.target.value })}
                    placeholder="Contoh: Budi, Sari, Andi..."
                    required
                    style={{ fontSize: '1rem', fontWeight: 600 }}
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Gunakan nama yang terlihat natural (nama depan saja).
                  </p>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Komisi Hari Ini (Rp)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={form.commission_today}
                      onChange={e => setForm({ ...form, commission_today: e.target.value })}
                      placeholder="Contoh: 150000"
                      required
                      min={0}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Posisi Ranking</label>
                    <input
                      className="form-input"
                      type="number"
                      value={form.rank_position}
                      onChange={e => setForm({ ...form, rank_position: e.target.value })}
                      placeholder="1, 2, 3..."
                      required
                      min={1}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Emoji Avatar</label>
                  <div style={{
                    display: 'flex', gap: '8px', flexWrap: 'wrap',
                  }}>
                    {EMOJI_OPTIONS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setForm({ ...form, avatar_emoji: emoji })}
                        style={{
                          width: '44px', height: '44px', fontSize: '1.4rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 'var(--radius-md)', cursor: 'pointer',
                          background: form.avatar_emoji === emoji
                            ? 'var(--accent-soft)'
                            : 'var(--bg-secondary)',
                          border: form.avatar_emoji === emoji
                            ? '2px solid var(--accent)'
                            : '1px solid var(--border-secondary)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)',
                  }}>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={e => setForm({ ...form, is_active: e.target.checked })}
                      style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    Tampilkan di Homepage (Aktif)
                  </label>
                </div>

                {/* Preview */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  marginBottom: '20px',
                }}>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '12px',
                  }}>
                    👁️ Preview — Tampilan di Homepage
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-secondary)',
                    borderRadius: 'var(--radius-md)', padding: '14px 18px',
                  }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: Number(form.rank_position) === 1
                        ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                        : Number(form.rank_position) === 2
                          ? 'linear-gradient(135deg, #94a3b8, #cbd5e1)'
                          : Number(form.rank_position) === 3
                            ? 'linear-gradient(135deg, #d97706, #b45309)'
                            : 'var(--bg-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1rem', fontWeight: 800,
                      color: Number(form.rank_position) <= 3 ? '#fff' : 'var(--text-muted)',
                    }}>
                      {form.rank_position || '?'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                        {form.avatar_emoji} {form.mitra_name || 'Nama Mitra'}
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 800, fontSize: '0.95rem',
                      color: 'var(--brand-success)',
                    }}>
                      {formatPrice(Number(form.commission_today) || 0)}
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>Batal</button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none' }}
                  >
                    {saving ? <span className="loading-spinner" /> : editEntry ? '💾 Simpan Perubahan' : '➕ Tambah Mitra'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Entries Table */}
        {loading ? (
          <div className="loading-page"><div className="loading-spinner" /></div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🏆</div>
            <h3>Belum ada data leaderboard</h3>
            <p>Tambahkan mitra dummy pertama untuk ditampilkan di halaman utama.</p>
            <button className="btn btn-primary" onClick={openCreate} style={{ marginTop: '16px' }}>
              + Tambah Mitra Dummy Pertama
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th>Nama Mitra</th>
                  <th>Komisi Hari Ini</th>
                  <th style={{ width: '100px' }}>Status</th>
                  <th style={{ width: '140px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} style={{ opacity: entry.is_active ? 1 : 0.5 }}>
                    <td>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: entry.rank_position === 1
                          ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                          : entry.rank_position === 2
                            ? 'linear-gradient(135deg, #94a3b8, #cbd5e1)'
                            : entry.rank_position === 3
                              ? 'linear-gradient(135deg, #d97706, #b45309)'
                              : 'var(--bg-tertiary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: 800,
                        color: entry.rank_position <= 3 ? '#fff' : 'var(--text-muted)',
                      }}>
                        {entry.rank_position}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{entry.avatar_emoji}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.mitra_name}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--brand-success)' }}>
                      {formatPrice(entry.commission_today)}
                    </td>
                    <td>
                      <button
                        className={`badge ${entry.is_active ? 'badge-success' : 'badge-neutral'}`}
                        onClick={() => toggleActive(entry)}
                        style={{ cursor: 'pointer', border: 'none' }}
                        title="Klik untuk toggle"
                      >
                        {entry.is_active ? '✅ Aktif' : '⏸️ Nonaktif'}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-info btn-sm"
                          onClick={() => openEdit(entry)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(entry.id)}
                          title="Hapus"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* How it looks section */}
        {entries.length > 0 && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            marginTop: '24px',
          }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '16px' }}>
              📱 Preview Tampilan di Homepage
            </h3>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              border: '1px solid var(--border-primary)',
            }}>
              <div style={{
                textAlign: 'center', marginBottom: '20px',
              }}>
                <div style={{
                  fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '1.5px', color: 'var(--text-muted)', marginBottom: '6px',
                }}>
                  🏆 Perolehan Komisi Mitra Hari Ini
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {entries.filter(e => e.is_active).slice(0, 5).map((entry) => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    background: 'var(--bg-card)',
                    border: entry.rank_position === 1
                      ? '1px solid rgba(251,191,36,0.3)'
                      : '1px solid var(--border-secondary)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                    boxShadow: entry.rank_position === 1 ? '0 0 20px rgba(251,191,36,0.08)' : 'none',
                  }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: entry.rank_position === 1
                        ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                        : entry.rank_position === 2
                          ? 'linear-gradient(135deg, #94a3b8, #cbd5e1)'
                          : entry.rank_position === 3
                            ? 'linear-gradient(135deg, #d97706, #b45309)'
                            : 'var(--bg-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 800,
                      color: entry.rank_position <= 3 ? '#fff' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}>
                      {entry.rank_position}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {entry.avatar_emoji} {entry.mitra_name}
                      </span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--brand-success)' }}>
                      {formatPrice(entry.commission_today)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
