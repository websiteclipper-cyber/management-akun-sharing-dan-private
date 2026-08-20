'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BUYER_BAN_MESSAGE, BUYER_BAN_TITLE } from '@/lib/buyerBan';

interface BanNotice {
  title: string;
  message: string;
}

export default function BuyerBanGuard() {
  const pathname = usePathname();
  const [notice, setNotice] = useState<BanNotice | null>(null);
  const isBackOffice = pathname.startsWith('/admin') || pathname.startsWith('/reseller');

  useEffect(() => {
    if (isBackOffice) {
      setNotice(null);
      return;
    }

    let cancelled = false;

    async function checkBuyerStatus() {
      const token = localStorage.getItem('buyer_token');
      if (!token) {
        if (!cancelled) setNotice(null);
        return;
      }

      try {
        const response = await fetch('/api/buyer/status', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const data = await response.json();

        if (cancelled) return;
        if (response.status === 403 && data.banned) {
          setNotice({
            title: data.title || BUYER_BAN_TITLE,
            message: data.message || BUYER_BAN_MESSAGE,
          });
          return;
        }

        if (response.ok) setNotice(null);
      } catch {
        // Keep the last known state during a transient network failure.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void checkBuyerStatus();
    }

    void checkBuyerStatus();
    const interval = window.setInterval(() => void checkBuyerStatus(), 60_000);
    window.addEventListener('focus', checkBuyerStatus);
    window.addEventListener('storage', checkBuyerStatus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', checkBuyerStatus);
      window.removeEventListener('storage', checkBuyerStatus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isBackOffice]);

  useEffect(() => {
    if (!notice) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [notice]);

  if (!notice || isBackOffice) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="buyer-ban-title"
      aria-describedby="buyer-ban-description"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        style={{
          width: 'min(100%, 520px)',
          borderRadius: '24px',
          border: '1px solid rgba(248, 113, 113, 0.45)',
          background: '#ffffff',
          boxShadow: '0 28px 80px rgba(15, 23, 42, 0.35)',
          padding: '36px 30px',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '76px',
            height: '76px',
            margin: '0 auto 22px',
            borderRadius: '999px',
            display: 'grid',
            placeItems: 'center',
            background: '#fee2e2',
            color: '#dc2626',
            fontSize: '2.25rem',
            fontWeight: 800,
          }}
        >
          !
        </div>
        <p
          style={{
            margin: '0 0 8px',
            color: '#dc2626',
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Akses Ditangguhkan
        </p>
        <h1
          id="buyer-ban-title"
          style={{
            margin: '0 0 16px',
            color: '#0f172a',
            fontSize: 'clamp(1.55rem, 5vw, 2rem)',
            lineHeight: 1.2,
          }}
        >
          {notice.title}
        </h1>
        <p
          id="buyer-ban-description"
          style={{
            margin: 0,
            color: '#475569',
            fontSize: '0.98rem',
            lineHeight: 1.75,
          }}
        >
          {notice.message}
        </p>
        <div
          style={{
            marginTop: '24px',
            padding: '14px 16px',
            borderRadius: '14px',
            background: '#fff7ed',
            color: '#9a3412',
            fontSize: '0.86rem',
            lineHeight: 1.55,
          }}
        >
          Ketentuan telah tersedia pada deskripsi produk sebelum transaksi dilakukan.
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            width: '100%',
            marginTop: '24px',
            border: 0,
            borderRadius: '12px',
            padding: '13px 18px',
            background: '#0f172a',
            color: '#ffffff',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Cek Status Kembali
        </button>
      </div>
    </div>
  );
}
