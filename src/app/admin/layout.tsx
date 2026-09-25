'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { adminSelect } from '@/lib/adminApi';
import {
  FiArchive, FiAward, FiBell, FiBox, FiDatabase, FiDollarSign,
  FiFileText, FiHome, FiLink, FiLogOut, FiMenu, FiMessageSquare, FiPercent,
  FiRefreshCw, FiSearch, FiSettings, FiShield, FiTag, FiUsers, FiX,
} from 'react-icons/fi';
import { ADMIN_SESSION_UPDATED_EVENT, AdminSession } from '@/lib/adminSession';
import styles from './admin-shell.module.css';

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: <FiHome /> },
  { label: 'Pesanan', href: '/admin/orders', icon: <FiFileText /> },
  { label: 'Assignment', href: '/admin/assignments', icon: <FiLink /> },
  { label: 'Produk', href: '/admin/products', icon: <FiBox /> },
  { label: 'Stok Akun', href: '/admin/stock-accounts', icon: <FiDatabase /> },
  { label: 'Pelanggan', href: '/admin/buyers', icon: <FiUsers /> },
  { label: 'Support', href: '/admin/support', icon: <FiMessageSquare /> },
  { label: 'Pengaturan', href: '/admin/settings', icon: <FiSettings /> },
  { section: 'Katalog & promosi' },
  { label: 'Promo & Diskon', href: '/admin/promos', icon: <FiTag /> },
  { label: 'Kode Diskon', href: '/admin/discounts', icon: <FiPercent /> },
  { section: 'Manajemen mitra' },
  { label: 'Reseller / Mitra', href: '/admin/resellers', icon: <FiUsers /> },
  { label: 'Pengaturan Komisi', href: '/admin/commissions', icon: <FiDollarSign /> },
  { label: 'Leaderboard Mitra', href: '/admin/leaderboard', icon: <FiAward /> },
  { section: 'Layanan & sistem' },
  { label: 'Klaim Garansi', href: '/admin/warranty', icon: <FiShield /> },
  { label: 'Pengajuan Refund', href: '/admin/refunds', icon: <FiRefreshCw /> },
  { label: 'Akun Backup', href: '/admin/backup-accounts', icon: <FiArchive /> },
];

interface RealtimeNotification {
  id: string;
  type: 'new_order' | 'support_ticket';
  message: string;
  time: Date;
  read: boolean;
}

// Keep the first browser render aligned with the server's loading shell.
const subscribeToHydration = () => () => {};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const pathname = usePathname();
  const router = useRouter();
  const isPublicAuthPath = [
    '/admin/login',
    '/admin/forgot-password',
    '/admin/reset-password',
  ].includes(pathname);
  const [admin, setAdmin] = useState<AdminSession | null>(() => {
    if (typeof window === 'undefined') return null;
    const session = localStorage.getItem('admin_session');
    if (!session) return null;
    try {
      return JSON.parse(session) as AdminSession;
    } catch {
      return null;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [menuSearch, setMenuSearch] = useState('');

  useEffect(() => {
    const handleSessionUpdated = (event: Event) => {
      setAdmin((event as CustomEvent<AdminSession>).detail);
    };

    window.addEventListener(ADMIN_SESSION_UPDATED_EVENT, handleSessionUpdated);
    return () => window.removeEventListener(ADMIN_SESSION_UPDATED_EVENT, handleSessionUpdated);
  }, []);

  // Load initial pending counts
  const loadPendingCounts = useCallback(async () => {
    const { data } = await adminSelect('orders', 'id', { payment_status: 'pending_payment' });
    setPendingOrdersCount((data || []).length);
  }, []);

  useEffect(() => {
    const session = localStorage.getItem('admin_session');
    const token = localStorage.getItem('admin_token');

    if (!session && !isPublicAuthPath) {
      router.push('/admin/login');
      return;
    }

    if (session && !token) {
      localStorage.removeItem('admin_session');
      router.push('/admin/login');
      return;
    }

    if (session && token) {
      fetch('/api/admin/auth/verify', {
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(res => {
        if (!res.ok) {
          localStorage.removeItem('admin_session');
          localStorage.removeItem('admin_token');
          setAdmin(null);
          router.push('/admin/login');
        }
      }).catch(() => {
        // Every sensitive API call still performs a server-side admin check.
        console.warn('Could not verify auth token');
      });
    }
  }, [isPublicAuthPath, pathname, router]);

  const playNotifSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.1;
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15);
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        osc2.connect(gainNode);
        osc2.frequency.value = 1100;
        osc2.type = 'sine';
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.15);
      }, 180);
    } catch {
      // Audio not supported
    }
  }, []);

  // Feature 3: Realtime Notifications
  useEffect(() => {
    if (!admin || pathname === '/admin/login') return;

    const initPendingCounts = async () => {
      await loadPendingCounts();
    };
    void initPendingCounts();

    // Subscribe to new orders (realtime)
    const ordersChannel = supabase
      .channel('admin-orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const order = payload.new;
          const notif: RealtimeNotification = {
            id: `order-${order.id}-${Date.now()}`,
            type: 'new_order',
            message: `🛒 Pesanan baru: ${order.order_number}`,
            time: new Date(),
            read: false,
          };
          setNotifications(prev => [notif, ...prev].slice(0, 20));
          setPendingOrdersCount(prev => prev + 1);
          playNotifSound();
        }
      )
      .subscribe();

    // Subscribe to new support tickets
    const ticketsChannel = supabase
      .channel('admin-tickets-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_tickets' },
        (payload) => {
          const ticket = payload.new;
          const notif: RealtimeNotification = {
            id: `ticket-${ticket.id}-${Date.now()}`,
            type: 'support_ticket',
            message: `🎫 Ticket baru: ${ticket.subject}`,
            time: new Date(),
            read: false,
          };
          setNotifications(prev => [notif, ...prev].slice(0, 20));
          playNotifSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(ticketsChannel);
    };
  }, [admin, pathname, loadPendingCounts, playNotifSound]);

  if (isPublicAuthPath) {
    return <>{children}</>;
  }

  if (!hydrated || !admin) {
    return <div className="loading-page"><div className="loading-spinner" /></div>;
  }

  async function handleLogout() {
    localStorage.removeItem('admin_session');
    localStorage.removeItem('admin_token');
    setAdmin(null);
    await supabase.auth.signOut();
    router.push('/admin/login');
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function handleNotifClick(notif: RealtimeNotification) {
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    setShowNotifications(false);
    if (notif.type === 'new_order') {
      router.push('/admin/orders');
    } else if (notif.type === 'support_ticket') {
      router.push('/admin/support');
    }
  }

  return (
    <div className={`admin-layout ${styles.shell}`}>
      <a className={styles.skipLink} href="#admin-content">Lewati ke konten</a>
      <button className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} aria-label="Tutup navigasi admin" tabIndex={sidebarOpen ? 0 : -1} />

      <aside id="admin-sidebar" className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <Link href="/admin" onClick={() => setSidebarOpen(false)} className={styles.brand}>pastipremium.my.id</Link>
          <p>Solusi Berlangganan AI</p>
          <button className={styles.sidebarClose} onClick={() => setSidebarOpen(false)} aria-label="Tutup navigasi admin"><FiX /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Navigasi admin">
          {navItems.map((item, i) => {
            if ('section' in item) {
              return <div key={i} className="sidebar-section">{item.section}</div>;
            }
            const isActive = item.href === '/admin' 
              ? pathname === '/admin' 
              : pathname.startsWith(item.href!);
            
            return (
              <Link
                key={i}
                href={item.href!}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-profile">
          <div className="profile-info">
            <div className="profile-avatar">
              {admin.name ? admin.name.slice(0, 2).toUpperCase() : 'AD'}
            </div>
            <div className="profile-meta">
              <div className="profile-name">{admin.name}</div>
              <div className="profile-role">{admin.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-logout" title="Logout" aria-label="Keluar dari admin">
            <FiLogOut style={{ fontSize: '0.95rem' }} />
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header className={`${styles.utilityBar} ${pathname === '/admin' ? styles.dashboardBar : ''}`}>
          <button className={styles.menuButton} onClick={() => setSidebarOpen(true)} aria-label="Buka navigasi admin" aria-expanded={sidebarOpen} aria-controls="admin-sidebar"><FiMenu /></button>
          <span className={styles.mobileBrand}>pastipremium.my.id</span>
          {pendingOrdersCount > 0 && pathname !== '/admin' && (
            <Link href="/admin/orders" className={styles.pendingLink}>{pendingOrdersCount} belum bayar</Link>
          )}
          <div className={styles.search} onKeyDown={event => { if (event.key === 'Escape') setMenuSearch(''); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuSearch(''); }}>
            <FiSearch aria-hidden="true" />
            <input aria-label="Cari menu admin" placeholder="Cari menu admin..." value={menuSearch} onChange={event => setMenuSearch(event.target.value)} />
            {menuSearch.trim() && (
              <div className={styles.searchResults}>
                {navItems.filter(item => item.label?.toLowerCase().includes(menuSearch.trim().toLowerCase())).map(item => (
                  <Link key={item.href} href={item.href!} onClick={() => setMenuSearch('')}><span>{item.icon}</span>{item.label}</Link>
                ))}
                {!navItems.some(item => item.label?.toLowerCase().includes(menuSearch.trim().toLowerCase())) && <p>Menu tidak ditemukan.</p>}
              </div>
            )}
          </div>
          <div className={styles.notification} onKeyDown={event => { if (event.key === 'Escape') setShowNotifications(false); }}>
            <button className={styles.bell} onClick={() => setShowNotifications(!showNotifications)} aria-label={`Notifikasi${unreadCount ? `, ${unreadCount} belum dibaca` : ''}`} aria-expanded={showNotifications} aria-controls="admin-notifications">
              <FiBell />
              {unreadCount > 0 && <span className={styles.notificationDot} />}
            </button>
            {showNotifications && (
              <>
                <button className={styles.notificationBackdrop} onClick={() => setShowNotifications(false)} aria-label="Tutup notifikasi" tabIndex={-1} />
                <section className={styles.notificationPanel} id="admin-notifications" aria-label="Notifikasi admin">
                  <div className={styles.notificationHeading}>
                    <strong>Notifikasi {unreadCount > 0 && `(${unreadCount})`}</strong>
                    <button onClick={() => setShowNotifications(false)} aria-label="Tutup notifikasi"><FiX /></button>
                  </div>
                  {unreadCount > 0 && <button className={styles.markRead} onClick={markAllRead}>Tandai semua dibaca</button>}
                  <div className={styles.notificationList}>
                    {notifications.length === 0 ? <p>Belum ada notifikasi</p> : notifications.map(notif => (
                      <button key={notif.id} onClick={() => handleNotifClick(notif)} data-unread={!notif.read}>
                        <span>{notif.message}</span>
                        <small>{notif.time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </header>

        <div id="admin-content" className="admin-route-content" tabIndex={-1}>{children}</div>
      </main>
    </div>
  );
}
