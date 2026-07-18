'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { adminSelect } from '@/lib/adminApi';
import { FiLogOut } from 'react-icons/fi';

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: '📊' },
  { section: 'Katalog' },
  { label: 'Produk', href: '/admin/products', icon: '📦' },
  { label: 'Stok Akun', href: '/admin/stock-accounts', icon: '🔑' },
  { label: 'Promo & Diskon', href: '/admin/promos', icon: '🏷️' },
  { label: 'Kode Diskon', href: '/admin/discounts', icon: '🎟️' },
  { section: 'Transaksi' },
  { label: 'Pesanan', href: '/admin/orders', icon: '🛒' },
  { label: 'Assignment', href: '/admin/assignments', icon: '🔗' },
  { section: 'Manajemen' },
  { label: 'Reseller / Mitra', href: '/admin/resellers', icon: '🤝' },
  { label: 'Pengaturan Komisi', href: '/admin/commissions', icon: '⚙️' },
  { label: 'Leaderboard Mitra', href: '/admin/leaderboard', icon: '🏆' },
  { label: 'Buyer', href: '/admin/buyers', icon: '👥' },
  { label: 'Support Tickets', href: '/admin/support', icon: '🎫' },
  { label: 'Klaim Garansi', href: '/admin/warranty', icon: '🛡️' },
  { section: 'Sistem' },
  { label: 'Akun Backup', href: '/admin/backup-accounts', icon: '🔄' },
  { label: 'Pengaturan Umum', href: '/admin/settings', icon: '⚙️' },
];

interface RealtimeNotification {
  id: string;
  type: 'new_order' | 'support_ticket';
  message: string;
  time: Date;
  read: boolean;
}

interface AdminSession {
  name: string;
  role: string;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicAuthPath = [
    '/admin/login',
    '/admin/forgot-password',
    '/admin/reset-password',
  ].includes(pathname);
  const [admin] = useState<AdminSession | null>(() => {
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

  if (!admin) {
    return <div className="loading-page"><div className="loading-spinner" /></div>;
  }

  async function handleLogout() {
    localStorage.removeItem('admin_session');
    localStorage.removeItem('admin_token');
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
    <div className="admin-layout">
      {/* Mobile overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <h1>
            <span className="brand-glow">✦</span> pastipremium.my.id
          </h1>
          <p>Admin Dashboard</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item, i) => {
            if ('section' in item) {
              return <div key={i} className="sidebar-section">{item.section}</div>;
            }
            const isActive = item.href === '/admin' 
              ? pathname === '/admin' 
              : pathname.startsWith(item.href!);
            
            // Add badge for orders
            const badge = null;

            return (
              <Link
                key={i}
                href={item.href!}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
                {badge && (
                  <span style={{
                    marginLeft: 'auto',
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '2px 8px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    minWidth: '22px',
                    textAlign: 'center',
                    animation: 'pulse 2s infinite',
                  }}>
                    {badge}
                  </span>
                )}
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
          <button onClick={handleLogout} className="btn-logout" title="Logout">
            <FiLogOut style={{ fontSize: '0.95rem' }} />
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <div className="mobile-only-topbar">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>✦ pastipremium.my.id</span>
          {/* Notification bell (mobile) */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              position: 'relative',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              borderRadius: '999px',
              fontSize: '1.3rem',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-2px', right: '-2px',
                background: '#ef4444', color: '#fff', borderRadius: '999px',
                padding: '1px 5px', fontSize: '0.65rem', fontWeight: 700,
                minWidth: '16px', textAlign: 'center',
              }}>
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Desktop notification bar — inline, not fixed */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: '12px', padding: '8px 28px',
          background: 'rgba(255,255,255,0.92)',
          borderBottom: '1px solid var(--border-primary)',
          backdropFilter: 'blur(12px)',
          position: 'sticky', top: 0, zIndex: 90,
        }} className="desktop-notif-bar">
          {/* Pending counts */}
          {pendingOrdersCount > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Link href="/admin/orders" style={{
                background: 'var(--admin-warning-soft)', border: '1px solid rgba(180,83,9,0.22)',
                borderRadius: '999px', padding: '4px 12px', fontSize: '0.75rem',
                fontWeight: 700, color: 'var(--admin-warning)', textDecoration: 'none',
              }}>
                💳 {pendingOrdersCount} Belum Bayar
              </Link>
            </div>
          )}

          {/* Notification bell */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                borderRadius: '50%', width: '36px', height: '36px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '1rem', position: 'relative',
                color: 'var(--text-secondary)',
                transition: 'all 0.2s',
              }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: '#ef4444', color: '#fff', borderRadius: '999px',
                  padding: '2px 6px', fontSize: '0.65rem', fontWeight: 700,
                  minWidth: '18px', textAlign: 'center',
                  animation: 'pulse 1.5s infinite',
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {showNotifications && (
              <>
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                  onClick={() => setShowNotifications(false)}
                />
                <div style={{
                  position: 'absolute', top: '44px', right: 0,
                  background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                  width: '360px', maxHeight: '440px', overflow: 'hidden',
                  zIndex: 100, animation: 'fadeIn 0.2s ease',
                }}>
                  <div style={{
                    padding: '14px 16px', borderBottom: '1px solid var(--border-secondary)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                      Notifikasi {unreadCount > 0 && `(${unreadCount})`}
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        style={{
                          background: 'none', border: 'none', color: 'var(--accent)',
                          fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        Tandai Dibaca
                      </button>
                    )}
                  </div>
                  <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{
                        padding: '32px 16px', textAlign: 'center',
                        color: 'var(--text-muted)', fontSize: '0.85rem',
                      }}>
                        Belum ada notifikasi
                      </div>
                    ) : (
                      notifications.map(notif => (
                        <button
                          key={notif.id}
                          onClick={() => handleNotifClick(notif)}
                          style={{
                            display: 'block', width: '100%',
                            padding: '12px 16px', textAlign: 'left',
                            background: notif.read ? 'transparent' : 'var(--admin-accent-soft)',
                            border: 'none', borderBottom: '1px solid var(--border-secondary)',
                            cursor: 'pointer', transition: 'background 0.2s',
                            color: 'inherit',
                          }}
                        >
                          <div style={{
                            fontSize: '0.85rem', fontWeight: notif.read ? 400 : 600,
                            color: 'var(--text-primary)', marginBottom: '4px',
                          }}>
                            {notif.message}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {notif.time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {children}
      </main>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .desktop-notif-bar { display: none !important; }
        }
        @media (min-width: 769px) {
          .mobile-only-topbar { display: none !important; }
        }
      `}</style>
    </div>
  );
}
