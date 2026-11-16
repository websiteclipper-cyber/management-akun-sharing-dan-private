'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FiAlertCircle, FiClock, FiGlobe, FiMonitor, FiRefreshCw, FiShield, FiSmartphone, FiTablet } from 'react-icons/fi';
import type { AdminLoginHistoryEntry } from '@/lib/adminLoginHistory';
import styles from './login-history.module.css';

const outcomes = {
  success: { label: 'Berhasil', className: styles.success },
  failed: { label: 'Gagal', className: styles.failed },
  blocked: { label: 'Dibatasi', className: styles.blocked },
};
const devices = { desktop: 'Komputer', mobile: 'Ponsel', tablet: 'Tablet', unknown: 'Tidak diketahui' };
const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
const timeFormatter = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' });
const countries = new Intl.DisplayNames(['id'], { type: 'region' });

function locationLabel(log: AdminLoginHistoryEntry): string {
  const country = log.country_code ? countries.of(log.country_code) : null;
  return [log.city, log.region, country].filter(Boolean).join(', ') || 'Lokasi tidak tersedia';
}

export default function LoginHistoryPage() {
  const [logs, setLogs] = useState<AdminLoginHistoryEntry[]>([]);
  const [outcome, setOutcome] = useState('all');
  const [days, setDays] = useState('30');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError('');
      if (!cursor) { setLogs([]); setNextCursor(null); }
      try {
        const params = new URLSearchParams({ outcome, days });
        if (cursor) params.set('cursor', cursor);
        const response = await fetch(`/api/admin/login-history?${params}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Riwayat login gagal dimuat.');
        if (!controller.signal.aborted) {
          setLogs(previous => {
            if (!cursor) return data.logs;
            const known = new Set(previous.map(row => row.id));
            return [...previous, ...data.logs.filter((row: AdminLoginHistoryEntry) => !known.has(row.id))];
          });
          setNextCursor(data.nextCursor);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Tidak dapat terhubung ke server.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [outcome, days, cursor, refresh]);

  function refreshLogs() { setCursor(null); setRefresh(value => value + 1); }

  return (
    <div className={`admin-content ${styles.page}`}>
      <div className={`admin-topbar ${styles.heading}`}>
        <div>
          <h2>Riwayat Login</h2>
          <p>Pantau akses ke dashboard admin dan kenali percobaan yang mencurigakan.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={refreshLogs} disabled={loading}>
          <FiRefreshCw aria-hidden="true" /> {loading ? 'Memuat...' : 'Muat ulang'}
        </button>
      </div>

      <div className={`admin-page-body ${styles.body}`}>
        <aside className={styles.notice} aria-label="Tentang riwayat login">
          <FiShield aria-hidden="true" />
          <div>
            <strong>Kenali setiap akses admin</strong>
            <p>Login berhasil, gagal, dan percobaan yang dibatasi tercatat di sini. Jika ada login yang tidak kamu kenali, <Link href="/admin/forgot-password">ganti password admin</Link>. Reset password mengakhiri semua sesi admin akun tersebut.</p>
          </div>
        </aside>

        <div className={styles.filters}>
          <label>Status login
            <select value={outcome} onChange={event => { setOutcome(event.target.value); setCursor(null); }}>
              <option value="all">Semua status</option>
              <option value="success">Berhasil</option>
              <option value="failed">Gagal</option>
              <option value="blocked">Dibatasi</option>
            </select>
          </label>
          <label>Rentang waktu
            <select value={days} onChange={event => { setDays(event.target.value); setCursor(null); }}>
              <option value="7">7 hari terakhir</option>
              <option value="30">30 hari terakhir</option>
              <option value="90">90 hari terakhir</option>
              <option value="all">Semua waktu</option>
            </select>
          </label>
          <span><FiClock aria-hidden="true" /> Semua waktu dalam WIB</span>
        </div>

        {error && (
          <div role="alert" className={styles.error}>
            <FiAlertCircle aria-hidden="true" /><span>{error}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRefresh(value => value + 1)}>Coba lagi</button>
          </div>
        )}

        <div className={`table-container ${styles.tableWrap}`} role="region" aria-label="Tabel riwayat login admin" tabIndex={0} aria-busy={loading}>
          <table className={`table ${styles.table}`}>
            <thead><tr>
              <th scope="col">Waktu (WIB)</th><th scope="col">Akun admin</th><th scope="col">Status</th>
              <th scope="col">Perangkat</th><th scope="col">Alamat IP</th><th scope="col">Perkiraan lokasi</th>
            </tr></thead>
            <tbody>
              {logs.map(log => {
                const status = outcomes[log.outcome];
                const DeviceIcon = log.device_type === 'mobile' ? FiSmartphone : log.device_type === 'tablet' ? FiTablet : FiMonitor;
                const date = new Date(log.occurred_at);
                return (
                  <tr key={log.id}>
                    <td><time dateTime={log.occurred_at}>{dateFormatter.format(date)}<small>{timeFormatter.format(date)} WIB</small></time></td>
                    <td><strong>{log.admin_name || 'Percobaan login'}</strong><small className={styles.email}>{log.email}</small></td>
                    <td><span className={`${styles.status} ${status.className}`}>{status.label}</span>{log.outcome === 'blocked' && <small>Batas percobaan login</small>}</td>
                    <td>
                      <span className={styles.device}><DeviceIcon aria-hidden="true" />{devices[log.device_type]}</span>
                      <small>{log.browser} · {log.os}</small>
                      {log.user_agent && <details className={styles.details}><summary>Detail browser</summary><p>{log.user_agent}</p></details>}
                    </td>
                    <td><code className={styles.ip}>{log.ip_address || 'Tidak tersedia'}</code></td>
                    <td><span className={styles.location}><FiGlobe aria-hidden="true" />{locationLabel(log)}</span>{log.location_source === 'vercel' && <small>Berdasarkan IP jaringan</small>}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && <tr><td colSpan={6} className={styles.empty}>
                {loading ? <p role="status">Memuat riwayat login...</p> : error ? <p>Data belum dapat ditampilkan.</p> : <><FiClock aria-hidden="true" /><h3>Belum ada riwayat login</h3><p>Tidak ada percobaan login pada filter ini. Riwayat mulai tercatat setelah fitur diaktifkan.</p></>}
              </td></tr>}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <p aria-live="polite">{logs.length} catatan ditampilkan{nextCursor ? ' · Masih ada riwayat lainnya' : ''}</p>
          {nextCursor && <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => setCursor(nextCursor)}>{loading ? 'Memuat...' : 'Muat lebih banyak'}</button>}
        </div>
        <p className={styles.footnote}>Lokasi adalah perkiraan dari IP dan bisa berbeda karena VPN atau jaringan seluler. Identitas perangkat mengikuti informasi browser. Data yang tidak tersedia ditampilkan apa adanya; aktivitas sebelum fitur aktif tidak dapat dipulihkan dari riwayat ini.</p>
      </div>
    </div>
  );
}
