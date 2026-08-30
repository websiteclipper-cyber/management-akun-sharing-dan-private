'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Product } from '@/lib/types';
import type { PublicLeaderboardEntry, PublicPromo } from '@/lib/public-home-data';
import { CATALOG_CATEGORIES, getProductCatalogCategory } from '@/lib/catalog-categories';
import { normalizeWhatsAppGroupLink, normalizeWhatsAppPhone } from '@/lib/phone';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import HelpPopup from '@/components/HelpPopup';
import { useLocale } from '@/lib/locale-context';
import { SiNetflix, SiSpotify, SiYoutube, SiApple, SiCanva, SiGooglegemini, SiNotion } from 'react-icons/si';
import { BsDisplay, BsStars } from 'react-icons/bs';
import { FiInfo, FiMonitor, FiX, FiFileText } from 'react-icons/fi';
import { TbBrandOpenai, TbBrandDisney, TbBrandAmazon, TbRobot, TbScissors, TbPhotoVideo } from 'react-icons/tb';

const PromoPopup = dynamic(() => import('@/components/PromoPopup'), { ssr: false });
const GlobalPromoPopup = dynamic(() => import('@/components/GlobalPromoPopup'), { ssr: false });

type Promo = PublicPromo;
type LeaderboardEntry = PublicLeaderboardEntry;

interface HomePageProps {
  initialProducts: Product[];
  initialPromos: Promo[];
  initialCatalogError: boolean;
  initialSettings: Record<string, string>;
  initialLeaderboard: LeaderboardEntry[];
}

interface BuyerSession {
  id: number;
  name: string;
  email: string;
  phone: string;
}

const BUYER_LOGIN_REDIRECT_KEY = 'buyer_login_redirect';

function safeInternalRedirect(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/';
}

// ── Squircle platform icons (white icon on brand gradient) ──
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  NETFLIX: <SiNetflix color="#fff" aria-hidden="true" focusable="false" />,
  SPOTIFY: <SiSpotify color="#fff" aria-hidden="true" focusable="false" />,
  YOUTUBE: <SiYoutube color="#fff" aria-hidden="true" focusable="false" />,
  DISNEY: <TbBrandDisney color="#fff" aria-hidden="true" focusable="false" />,
  VIDIO: <FiMonitor color="#fff" aria-hidden="true" focusable="false" />,
  VIU: <BsDisplay color="#fff" aria-hidden="true" focusable="false" />,
  PRIME: <TbBrandAmazon color="#fff" aria-hidden="true" focusable="false" />,
  APPLE: <SiApple color="#fff" aria-hidden="true" focusable="false" />,
  CANVA: <SiCanva color="#fff" aria-hidden="true" focusable="false" />,
  CHATGPT: <TbBrandOpenai color="#fff" aria-hidden="true" focusable="false" />,
  GEMINI: <SiGooglegemini color="#fff" aria-hidden="true" focusable="false" />,
  NOTION: <SiNotion color="#fff" aria-hidden="true" focusable="false" />,
  GROK: <TbRobot color="#fff" aria-hidden="true" focusable="false" />,
  CAPCUT: <TbScissors color="#fff" aria-hidden="true" focusable="false" />,
  WINK: <TbPhotoVideo color="#fff" aria-hidden="true" focusable="false" />,
  DEFAULT: <BsStars color="#fff" aria-hidden="true" focusable="false" />,
};

// Brand gradient backgrounds for squircle icons
const PLATFORM_GRADIENTS: Record<string, string> = {
  NETFLIX: 'linear-gradient(135deg, #E50914 0%, #831010 100%)',
  SPOTIFY: 'linear-gradient(135deg, #1DB954 0%, #148A3C 100%)',
  YOUTUBE: 'linear-gradient(135deg, #FF0000 0%, #CC0000 100%)',
  DISNEY: 'linear-gradient(135deg, #113CCF 0%, #0B2A9E 100%)',
  VIDIO: 'linear-gradient(135deg, #FF0055 0%, #CC0044 100%)',
  VIU: 'linear-gradient(135deg, #FFCC00 0%, #E6B800 100%)',
  PRIME: 'linear-gradient(135deg, #00A8E1 0%, #0082B0 100%)',
  APPLE: 'linear-gradient(135deg, #555555 0%, #1d1d1f 100%)',
  CANVA: 'linear-gradient(135deg, #00C4CC 0%, #00969C 100%)',
  CHATGPT: 'linear-gradient(135deg, #10A37F 0%, #0D7A5F 100%)',
  GEMINI: 'linear-gradient(135deg, #8E75B2 0%, #6B5899 100%)',
  NOTION: 'linear-gradient(135deg, #252525 0%, #000000 100%)',
  GROK: 'linear-gradient(135deg, #1d1d1f 0%, #333333 100%)',
  CAPCUT: 'linear-gradient(135deg, #1d1d1f 0%, #333333 100%)',
  WINK: 'linear-gradient(135deg, #FF0055 0%, #AA003A 100%)',
  DEFAULT: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
};

function getPlatformIcon(name: string) {
  const upper = name.toUpperCase();
  for (const [key, icon] of Object.entries(PLATFORM_ICONS)) {
    if (upper.includes(key)) return icon;
  }
  return PLATFORM_ICONS.DEFAULT;
}

function getPlatformGradient(name: string) {
  const upper = name.toUpperCase();
  for (const [key, gradient] of Object.entries(PLATFORM_GRADIENTS)) {
    if (upper.includes(key)) return gradient;
  }
  return PLATFORM_GRADIENTS.DEFAULT;
}

function getAvailableStock(product: Product): number {
  const stock = Number(product.available_stock || 0);
  return Number.isFinite(stock) ? Math.max(0, Math.trunc(stock)) : 0;
}

function isProductUnavailable(product: Product): boolean {
  return product.status !== 'active';
}

// ── Medal styles for leaderboard ──
const MEDAL_STYLES: Record<number, { bg: string; shadow: string; label: string }> = {
  1: { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', shadow: '0 4px 16px rgba(255,215,0,0.45)', label: '🥇' },
  2: { bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', shadow: '0 4px 16px rgba(192,192,192,0.4)', label: '🥈' },
  3: { bg: 'linear-gradient(135deg, #CD7F32, #A0522D)', shadow: '0 4px 16px rgba(205,127,50,0.4)', label: '🥉' },
};

export default function HomePage({
  initialProducts,
  initialPromos,
  initialCatalogError,
  initialSettings,
  initialLeaderboard,
}: HomePageProps) {
  const { t, formatPrice, isIDR, currency } = useLocale();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [promos, setPromos] = useState<Promo[]>(initialPromos);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(initialCatalogError);
  const [buyer, setBuyer] = useState<BuyerSession | null>(() => {
    if (typeof window === 'undefined') return null;
    const session = localStorage.getItem('buyer_session');
    if (!session) return null;
    try {
      return JSON.parse(session) as BuyerSession;
    } catch {
      return null;
    }
  });
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [supportWa, setSupportWa] = useState(initialSettings.support_whatsapp || '');
  const [supportGroupLink, setSupportGroupLink] = useState(initialSettings.maintenance_whatsapp_group || '');
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpLoading, setHelpLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(initialLeaderboard);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [promosReady, setPromosReady] = useState(false);

  async function loadProducts() {
    setLoading(true);
    setCatalogError(false);

    try {
      const response = await fetch('/api/public/catalog', {
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error('Unable to load catalog.');

      const catalog = await response.json();
      setProducts(catalog.products || []);
      setPromos(catalog.promos || []);
    } catch {
      setProducts([]);
      setPromos([]);
      setCatalogError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const promoTimer = window.setTimeout(() => setPromosReady(true), 4000);
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('ref_code', ref.toUpperCase());
      localStorage.setItem('ref_code_ts', Date.now().toString());
    } else {
      const refTs = localStorage.getItem('ref_code_ts');
      if (refTs && Date.now() - Number(refTs) > 30 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('ref_code');
        localStorage.removeItem('ref_code_ts');
      }
    }

    fetch('/api/public/leaderboard')
      .then(r => r.json())
      .then(d => setLeaderboard(d.entries || []))
      .catch(() => {});

    return () => window.clearTimeout(promoTimer);
  }, []);

  useEffect(() => {
    // Supabase falls back to its configured Site URL when an OAuth redirect
    // is not allow-listed. Complete the buyer session from the homepage too,
    // so a www/non-www mismatch cannot strand a signed-in buyer at `/`.
    if (buyer) return;

    const storedRedirect = sessionStorage.getItem(BUYER_LOGIN_REDIRECT_KEY);
    if (!storedRedirect) return;

    let cancelled = false;
    let exchangedAccessToken = '';
    const pendingTimers = new Set<number>();

    async function exchangeFallbackSession(accessToken: string) {
      if (cancelled || !accessToken || exchangedAccessToken === accessToken) return;
      exchangedAccessToken = accessToken;

      try {
        const response = await fetch('/api/buyer/auth/exchange', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const data = await response.json();
        if (cancelled) return;

        const destination = safeInternalRedirect(
          sessionStorage.getItem(BUYER_LOGIN_REDIRECT_KEY),
        );

        if (response.ok && data.needs_profile) {
          router.replace(`/buyer/login?redirect=${encodeURIComponent(destination)}`);
          return;
        }

        if (!response.ok || !data.token || !data.buyer) {
          exchangedAccessToken = '';
          router.replace(`/buyer/login?redirect=${encodeURIComponent(destination)}`);
          return;
        }

        localStorage.setItem('buyer_token', data.token);
        localStorage.setItem('buyer_session', JSON.stringify(data.buyer));
        sessionStorage.removeItem(BUYER_LOGIN_REDIRECT_KEY);
        setBuyer(data.buyer as BuyerSession);
        router.replace(destination);
      } catch {
        if (cancelled) return;
        exchangedAccessToken = '';
        const destination = safeInternalRedirect(
          sessionStorage.getItem(BUYER_LOGIN_REDIRECT_KEY),
        );
        router.replace(`/buyer/login?redirect=${encodeURIComponent(destination)}`);
      }
    }

    let unsubscribe: (() => void) | undefined;

    void import('@/lib/supabase').then(({ supabase }) => {
      if (cancelled) return;

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.access_token) return;
        const timer = window.setTimeout(() => {
          pendingTimers.delete(timer);
          void exchangeFallbackSession(session.access_token);
        }, 0);
        pendingTimers.add(timer);
      });
      unsubscribe = () => authListener.subscription.unsubscribe();

      void supabase.auth.getSession().then(({ data }) => {
        if (data.session?.access_token) {
          void exchangeFallbackSession(data.session.access_token);
        }
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      pendingTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [buyer, router]);

  async function handleLogout() {
    localStorage.removeItem('buyer_session');
    localStorage.removeItem('buyer_token');
    setBuyer(null);
    setMenuOpen(false);
    const { supabase } = await import('@/lib/supabase');
    await supabase.auth.signOut({ scope: 'local' });
  }

  async function openHelpPopup() {
    setHelpOpen(true);
    setMenuOpen(false);
    setHelpLoading(true);

    try {
      const response = await fetch('/api/public/settings', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to refresh help settings.');

      const settings = await response.json() as Record<string, string>;
      setSupportWa(settings.support_whatsapp || '');
      setSupportGroupLink(settings.maintenance_whatsapp_group || '');
    } catch {
      // Keep the server-rendered settings available if the refresh fails.
    } finally {
      setHelpLoading(false);
    }
  }

  const categories = Array.from(new Set(
    products
      .filter(p => p.status === 'active')
      .map(p => p.platform_name.toUpperCase())
  ));
  const normalizedSupportWa = normalizeWhatsAppPhone(supportWa);
  const waUrl = normalizedSupportWa
    ? `https://wa.me/${normalizedSupportWa}?text=${encodeURIComponent('Hi admin pastipremium.my.id, I need help.')}`
    : null;
  const whatsappGroupUrl = normalizeWhatsAppGroupLink(supportGroupLink);
  const hasHelpOption = Boolean(waUrl || whatsappGroupUrl);

  // Modern clean color system
  const C_BG = 'var(--bg-base)';
  const C_TEXT = 'var(--text-primary)';
  const C_TEXT_MUTED = 'var(--text-secondary)';
  const C_BLUE = 'var(--accent)';
  const C_BLUE_HOVER = 'var(--accent-hover)';
  const C_CARD = 'var(--bg-card)';
  const C_SHADOW = 'var(--shadow-md)';
  const C_BORDER = 'var(--border-primary)';
  const C_SURFACE = 'var(--bg-secondary)';

  const BRAND_GLOWS: Record<string, string> = {
    NETFLIX: 'rgba(229, 9, 20, 0.15)',
    SPOTIFY: 'rgba(29, 185, 84, 0.15)',
    YOUTUBE: 'rgba(255, 0, 0, 0.15)',
    DISNEY: 'rgba(17, 60, 207, 0.15)',
    VIDIO: 'rgba(255, 0, 85, 0.15)',
    VIU: 'rgba(255, 204, 0, 0.12)',
    PRIME: 'rgba(0, 168, 225, 0.15)',
    APPLE: 'rgba(15, 23, 42, 0.1)',
    CANVA: 'rgba(0, 196, 204, 0.15)',
    CHATGPT: 'rgba(16, 163, 127, 0.15)',
    GEMINI: 'rgba(142, 117, 178, 0.15)',
    NOTION: 'rgba(15, 23, 42, 0.12)',
    GROK: 'rgba(15, 23, 42, 0.08)',
    CAPCUT: 'rgba(15, 23, 42, 0.08)',
    WINK: 'rgba(255, 0, 85, 0.15)',
    DEFAULT: 'rgba(245, 158, 11, 0.15)',
  };

  function getPlatformGlow(name: string) {
    const upper = name.toUpperCase();
    for (const [key, color] of Object.entries(BRAND_GLOWS)) {
      if (upper.includes(key)) return color;
    }
    return BRAND_GLOWS.DEFAULT;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: C_BG,
      fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: C_TEXT,
      position: 'relative',
      maxWidth: '100vw',
      overflowX: 'hidden',
    }}>
      {promosReady && (
        <>
          <PromoPopup />
          <GlobalPromoPopup
            initialSettings={initialSettings}
            onSelectPlatform={(platform) => {
              setSelectedCategory(platform.toUpperCase());
              const el = document.getElementById('katalog');
              if (el) {
                const y = el.getBoundingClientRect().top + window.scrollY - 80;
                window.scrollTo({ top: y, behavior: 'smooth' });
              }
            }}
          />
        </>
      )}

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderBottom: '1px solid var(--glass-border)',
        padding: '0 24px',
        height: '68px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 0 rgba(15, 23, 42, 0.03)',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <span style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: C_TEXT,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.78rem',
            fontWeight: 800,
            boxShadow: '0 8px 18px rgba(15, 23, 42, 0.12)',
          }}>PP</span>
          <span style={{
            fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0',
            color: C_TEXT,
          }}>
            PastiPremium
          </span>
        </Link>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <LanguageSwitcher />
          <Link
            href="/ketentuan"
            className="hide-on-mobile"
            style={{
              fontSize: '0.85rem', fontWeight: 500,
              color: C_TEXT_MUTED, textDecoration: 'none', transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT}
            onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}
          >Ketentuan</Link>
          <Link
            href="/refund"
            className="hide-on-mobile"
            style={{ fontSize: '0.85rem', fontWeight: 500, color: C_TEXT_MUTED, textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT}
            onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}
          >Refund</Link>
          <Link
            href="/reseller/login"
            className="hide-on-mobile"
            style={{
              fontSize: '0.85rem', fontWeight: 500,
              color: C_TEXT_MUTED, textDecoration: 'none', transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT}
            onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}
          >{t('header_mitra')}</Link>

          {buyer ? (
            <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link
                href="/buyer/lookup"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: C_SURFACE,
                  border: `1px solid ${C_BORDER}`,
                  borderRadius: '10px', padding: '8px 14px',
                  fontSize: '0.8rem', fontWeight: 600, color: C_TEXT,
                  textDecoration: 'none', transition: 'all 0.2s',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-card)';
                  e.currentTarget.style.borderColor = 'var(--border-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C_SURFACE;
                  e.currentTarget.style.borderColor = 'var(--border-primary)';
                }}
              >
                {t('header_my_orders')}
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  fontSize: '0.8rem', fontWeight: 600,
                  color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '4px 8px', transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >{t('header_logout')}</button>
            </div>
          ) : (
            <Link
              href="/buyer/login"
              className="hide-on-mobile"
              style={{
                background: C_BLUE, color: '#fff',
                padding: '9px 16px', borderRadius: '10px',
                fontSize: '0.8rem', fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.2s',
                boxShadow: '0 10px 22px rgba(37, 99, 235, 0.18)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C_BLUE_HOVER;
                e.currentTarget.style.boxShadow = '0 14px 28px rgba(37, 99, 235, 0.24)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C_BLUE;
                e.currentTarget.style.boxShadow = '0 10px 22px rgba(37, 99, 235, 0.18)';
              }}
            >{t('header_login')}</Link>
          )}

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className="mobile-menu-btn"
            aria-label={menuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              marginLeft: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              border: `1px solid ${C_BORDER}`,
              background: C_CARD,
              color: C_TEXT,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* ── MOBILE MENU OVERLAY ── */}
      <>
        {menuOpen && (
          <div
            style={{
              position: 'fixed', top: '68px', left: 0, right: 0,
              background: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              borderBottom: '1px solid var(--border-primary)',
              padding: '20px 24px',
              zIndex: 99,
              display: 'flex', flexDirection: 'column', gap: '20px',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <Link href="/ketentuan" onClick={() => setMenuOpen(false)} style={{ color: C_TEXT, textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>Ketentuan</Link>
            <Link href="/refund" onClick={() => setMenuOpen(false)} style={{ color: C_TEXT, textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>Ajukan Refund</Link>
            <Link href="/reseller/login" onClick={() => setMenuOpen(false)} style={{ color: C_TEXT, textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>{t('header_mitra')}</Link>

            <div style={{ height: '1px', background: 'var(--border-primary)' }} />

            {buyer ? (
              <>
                <Link href="/buyer/lookup" onClick={() => setMenuOpen(false)} style={{ color: C_TEXT, textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>{t('header_my_orders')}</Link>
                <button onClick={handleLogout} style={{ color: '#ef4444', textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600, background: 'transparent', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }}>{t('header_logout')}</button>
              </>
            ) : (
              <Link href="/buyer/login" onClick={() => setMenuOpen(false)} style={{ color: C_BLUE, textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>{t('header_login')}</Link>
            )}
          </div>
        )}
      </>

      <main>
      {/* Hero */}
      <section
        style={{
          padding: '88px 20px 64px',
          textAlign: 'center',
          maxWidth: '920px', margin: '0 auto',
          position: 'relative',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(2.1rem, 7vw, 3.3rem)',
            fontWeight: 800,
            letterSpacing: 0,
            lineHeight: 1.1,
            color: C_TEXT,
            marginBottom: '16px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {t('hero_title_2')}
        </h1>
        <p
          style={{
            fontSize: '1.15rem', color: C_TEXT_MUTED,
            lineHeight: 1.6, maxWidth: '520px',
            margin: '0 auto 40px', fontWeight: 400,
            position: 'relative', zIndex: 1,
          }}
        >
          {t('hero_subtitle')}
        </p>

        <div
          style={{ display: 'flex', gap: '16px', justifyContent: 'center', position: 'relative', zIndex: 1, flexWrap: 'wrap' }}
        >
          <button
            onClick={() => {
              const el = document.getElementById('katalog');
              if (el) {
                const y = el.getBoundingClientRect().top + window.scrollY - 80;
                window.scrollTo({ top: y, behavior: 'smooth' });
              }
            }}
            style={{
              background: C_BLUE, color: '#fff', border: 'none',
              padding: '15px 30px', borderRadius: '12px',
              fontSize: '1rem', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.25s ease',
              boxShadow: '0 14px 28px rgba(37, 99, 235, 0.20)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C_BLUE_HOVER;
              e.currentTarget.style.boxShadow = '0 18px 34px rgba(37, 99, 235, 0.25)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = C_BLUE;
              e.currentTarget.style.boxShadow = '0 14px 28px rgba(37, 99, 235, 0.20)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >{t('view_catalog')}</button>
          <Link
            href="/ketentuan"
            style={{
              background: C_CARD, color: C_TEXT,
              border: `1px solid ${C_BORDER}`,
              padding: '15px 30px', borderRadius: '12px',
              fontSize: '1rem', fontWeight: 600,
              textDecoration: 'none', transition: 'all 0.25s ease',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: 'var(--shadow-sm)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-card-hover)';
              e.currentTarget.style.borderColor = 'var(--border-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = C_CARD;
              e.currentTarget.style.borderColor = 'var(--border-primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <FiFileText /> {t('terms_all_products')}
          </Link>
          {hasHelpOption && (
            <button
              type="button"
              onClick={openHelpPopup}
              style={{
                background: C_CARD, color: C_TEXT,
                border: `1px solid ${C_BORDER}`,
                padding: '15px 30px', borderRadius: '12px',
                fontSize: '1rem', fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.25s ease',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-card-hover)';
                e.currentTarget.style.borderColor = 'var(--border-hover)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C_CARD;
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >{t('help')}</button>
          )}
        </div>
      </section>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section style={{ padding: '0 24px 60px', maxWidth: '1050px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div
            style={{
              background: C_CARD,
              borderRadius: 'var(--radius-xl)',
              padding: '32px 36px',
              boxShadow: C_SHADOW,
              border: `1px solid ${C_BORDER}`,
              display: 'flex', flexDirection: 'column', gap: '24px',
              position: 'relative', overflow: 'hidden'
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              borderBottom: `1px solid ${C_BORDER}`, paddingBottom: '20px',
              flexWrap: 'wrap', gap: '16px'
            }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: 0, marginBottom: '6px', color: C_TEXT }}>{t('leaderboard_title')}</h3>
                <p style={{ fontSize: '0.88rem', color: C_TEXT_MUTED, margin: 0 }}>{t('leaderboard_subtitle')}</p>
              </div>
              <Link href="/reseller/register" style={{
                fontSize: '0.88rem', fontWeight: 600, color: C_BLUE, textDecoration: 'none',
                transition: 'color 0.2s'
              }}
                onMouseEnter={(e) => e.currentTarget.style.color = C_BLUE_HOVER}
                onMouseLeave={(e) => e.currentTarget.style.color = C_BLUE}
              >
                {t('join_program')} →
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {leaderboard.map((entry, idx) => {
                const medal = MEDAL_STYLES[entry.rank_position];
                const isTopThree = entry.rank_position <= 3;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '16px 20px', borderRadius: '14px',
                      background: isTopThree ? C_SURFACE : 'var(--bg-card)',
                      border: `1px solid ${C_BORDER}`,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{
                      width: '46px', height: '46px', borderRadius: '50%',
                      background: medal ? medal.bg : C_SURFACE,
                      boxShadow: medal ? medal.shadow : 'none',
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: medal ? '1.25rem' : '0.95rem',
                      fontWeight: 700,
                      color: medal ? '#fff' : C_TEXT_MUTED,
                    }}>
                      {medal ? medal.label : entry.rank_position}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 700, fontSize: '1rem', color: C_TEXT,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {entry.avatar_emoji} {entry.mitra_name}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--brand-success)' }}>
                        {formatPrice(entry.commission_today)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Catalog */}
      <section id="katalog" style={{ padding: '0 24px 100px', maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '240px', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ width: '28px', height: '28px', border: '3px solid var(--border-secondary)', borderTopColor: C_BLUE, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>

        ) : catalogError ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: C_TEXT_MUTED }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.3rem', marginBottom: '8px', color: C_TEXT }}>
              {t('catalog_error_title')}
            </h2>
            <p style={{ marginBottom: '20px' }}>{t('catalog_error_desc')}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void loadProducts()}
            >
              {t('catalog_retry')}
            </button>
          </div>

        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: C_TEXT_MUTED }}>
            <h2 style={{ fontWeight: 700, fontSize: '1.3rem', marginBottom: '8px', color: C_TEXT }}>{t('catalog_empty_title')}</h2>
            <p>{t('catalog_empty_desc')}</p>
          </div>

        ) : (
          <>
            {!selectedCategory ? (
              <div
                key="categories"
              >
                <div style={{ marginBottom: '44px', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: 0, marginBottom: '10px', color: C_TEXT }}>
                    {t('choose_platform')}
                  </h2>
                  <p style={{ fontSize: '1.05rem', color: C_TEXT_MUTED }}>{t('categories_available', { count: categories.length })}</p>
                </div>

                {(() => {
                  const groupedCategories = CATALOG_CATEGORIES
                    .map(group => ({
                      title: group.title,
                      platforms: categories.filter(platform => {
                        const product = products.find(item =>
                          item.status === 'active' && item.platform_name.toUpperCase() === platform,
                        );
                        return getProductCatalogCategory(product) === group.id;
                      }),
                    }))
                    .filter(group => group.platforms.length > 0);

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
                      {groupedCategories.map(group => (
                        <div key={group.title}>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '18px', color: C_TEXT, borderBottom: `1px solid ${C_BORDER}`, paddingBottom: '12px' }}>
                            {group.title}
                          </h3>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '24px',
                          }}>
                            {group.platforms.map(category => {
                              const count = products.filter(p =>
                                p.platform_name.toUpperCase() === category && !isProductUnavailable(p)
                              ).length;
                              const icon = getPlatformIcon(category);
                              const gradient = getPlatformGradient(category);
                              const glowColor = getPlatformGlow(category);

                              return (
                                <button
                                  type="button"
                                  key={category}
                                  className="platform-card"
                                  onClick={() => setSelectedCategory(category)}
                                  style={{
                                    background: C_CARD,
                                    borderRadius: 'var(--radius-xl)',
                                    padding: '36px 28px',
                                    cursor: 'pointer',
                                    boxShadow: C_SHADOW,
                                    transition: 'all var(--transition-normal)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                                    border: `1px solid ${C_BORDER}`
                                  }}
                                >
                                  {/* Squircle icon with brand gradient */}
                                  <div aria-hidden="true" style={{
                                    width: '68px', height: '68px',
                                    borderRadius: '20px',
                                    background: gradient,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2.1rem', marginBottom: '20px',
                                    boxShadow: `0 8px 24px ${glowColor.replace('0.15', '0.35').replace('0.12', '0.3').replace('0.08', '0.15').replace('0.1', '0.2')}`,
                                    transition: 'transform 0.3s ease',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.08) rotate(4deg)'}
                                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) rotate(0deg)'}
                                  >{icon}</div>

                                  <h3 style={{ fontWeight: 700, fontSize: '1.2rem', color: C_TEXT, marginBottom: '6px' }}>
                                    {category}
                                  </h3>
                                  <p style={{ fontSize: '0.9rem', color: C_TEXT_MUTED, fontWeight: 500 }}>
                                    {t('variants_available', { count })}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div
                key="products"
              >
                {/* Category Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  marginBottom: '40px', borderBottom: `1px solid ${C_BORDER}`, paddingBottom: '28px'
                }}>
                  <button
                    type="button"
                    aria-label="Kembali ke daftar platform"
                    onClick={() => setSelectedCategory(null)}
                    style={{
                      width: '42px', height: '42px',
                      background: C_CARD, borderRadius: '12px',
                      cursor: 'pointer', color: C_TEXT, border: `1px solid ${C_BORDER}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.3rem', flexShrink: 0, transition: 'all 0.2s ease',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >←</button>
                  <div>
                    <h2 style={{
                      fontSize: '2rem', fontWeight: 800, letterSpacing: 0, marginBottom: '2px',
                      display: 'flex', alignItems: 'center', gap: '14px', color: C_TEXT
                    }}>
                      {/* Smaller squircle icon in header */}
                      <span aria-hidden="true" style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '40px', height: '40px', borderRadius: '12px',
                        background: getPlatformGradient(selectedCategory),
                        fontSize: '1.25rem',
                        boxShadow: `0 4px 14px ${getPlatformGlow(selectedCategory)}`
                      }}>
                        {getPlatformIcon(selectedCategory)}
                      </span>
                      {selectedCategory}
                    </h2>
                  </div>
                </div>

                {/* Product cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '28px'
                }}>
                  {products
                    .filter(p => p.platform_name.toUpperCase() === selectedCategory)
                    .sort((a, b) => {
                      const aSoldOut = isProductUnavailable(a);
                      const bSoldOut = isProductUnavailable(b);
                      if (!aSoldOut && bSoldOut) return -1;
                      if (aSoldOut && !bSoldOut) return 1;

                      const now = new Date();

                      const promoA = promos.find(pr =>
                        pr.product_id === a.id &&
                        new Date(pr.start_date) <= now &&
                        new Date(pr.end_date) >= now
                      );
                      const priceA = promoA
                        ? promoA.promo_price
                        : (a.newcomer_price !== null && a.newcomer_price !== undefined ? a.newcomer_price : a.price);

                      const promoB = promos.find(pr =>
                        pr.product_id === b.id &&
                        new Date(pr.start_date) <= now &&
                        new Date(pr.end_date) >= now
                      );
                      const priceB = promoB
                        ? promoB.promo_price
                        : (b.newcomer_price !== null && b.newcomer_price !== undefined ? b.newcomer_price : b.price);

                      return priceA - priceB;
                    })
                    .map((product) => {
                      const promo = promos.find(pr => {
                        const now = new Date();
                        return pr.product_id === product.id &&
                          new Date(pr.start_date) <= now &&
                          new Date(pr.end_date) >= now;
                      });

                      const hasNewcomerPrice = product.newcomer_price !== null && product.newcomer_price !== undefined;
                      const availableStock = getAvailableStock(product);
                      const isUnavailable = isProductUnavailable(product);

                      return (
                        <div
                          key={product.id}
                          className="product-card"
                          data-inactive={isUnavailable}
                          style={{
                            background: C_CARD,
                            borderRadius: 'var(--radius-xl)',
                            padding: '32px',
                            boxShadow: isUnavailable
                              ? 'none'
                              : promo
                              ? '0 14px 34px rgba(239, 68, 68, 0.08)'
                              : hasNewcomerPrice
                              ? '0 14px 34px rgba(37, 99, 235, 0.08)'
                              : C_SHADOW,
                            border: isUnavailable
                              ? '1px solid var(--border-secondary)'
                              : promo
                              ? '1px solid rgba(239, 68, 68, 0.2)'
                              : hasNewcomerPrice
                              ? '1px solid rgba(37, 99, 235, 0.18)'
                              : `1px solid ${C_BORDER}`,
                            display: 'flex', flexDirection: 'column',
                            position: 'relative',
                            transition: 'all var(--transition-normal)',
                            opacity: isUnavailable ? 0.55 : 1,
                            filter: isUnavailable ? 'grayscale(80%)' : 'none',
                          }}
                        >
                        {/* Sold Out or Promo/Newcomer Badge */}
                        {isUnavailable ? (
                          <div style={{
                            position: 'absolute', top: '-14px', left: '32px',
                            background: '#334155',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            color: '#f8fafc',
                            padding: '6px 16px', borderRadius: '12px',
                            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            boxShadow: '0 8px 18px rgba(15,23,42,0.16)',
                          }}>
                            SOLD OUT
                          </div>
                        ) : (
                          <>
                            {/* Promo badge — Glassmorphism */}
                            {promo && (
                              <div style={{
                                position: 'absolute', top: '-14px', left: '32px',
                                background: 'rgba(239,68,68,0.95)',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                color: '#fff',
                                padding: '6px 16px', borderRadius: '12px',
                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                                boxShadow: '0 8px 18px rgba(239,68,68,0.22)',
                              }}>
                                {promo.promo_label}
                              </div>
                            )}

                            {/* Newcomer badge — Glassmorphism */}
                            {hasNewcomerPrice && !promo && (
                              <div style={{
                                position: 'absolute', top: '-14px', left: '32px',
                                background: C_BLUE,
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                color: '#fff',
                                padding: '6px 16px', borderRadius: '12px',
                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                                boxShadow: '0 8px 18px rgba(37,99,235,0.22)',
                              }}>
                                {t('newcomer_badge')}
                              </div>
                            )}
                          </>
                        )}

                        <div style={{
                          fontSize: '0.78rem', fontWeight: 700, color: C_TEXT_MUTED,
                          textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '10px',
                          marginTop: (promo || hasNewcomerPrice) ? '10px' : '0'
                        }}>
                          {product.platform_name}
                        </div>

                        <h3 style={{
                          fontSize: '1.32rem', fontWeight: 700, color: C_TEXT,
                          marginBottom: '14px', lineHeight: 1.3, letterSpacing: 0
                        }}>{product.name}</h3>

                        {product.description && (
                          <div style={{ marginBottom: '24px' }}>
                            <p
                              className="product-description-preview"
                              style={{
                                fontSize: '0.9rem',
                                color: C_TEXT_MUTED,
                                lineHeight: 1.55,
                                margin: '0 0 12px',
                              }}
                            >
                              {product.description}
                            </p>
                            <button
                              type="button"
                              onClick={() => setDetailProduct(product)}
                              className="product-detail-button"
                              aria-label={`Lihat detail ${product.name}`}
                            >
                              <FiInfo aria-hidden="true" focusable="false" />
                              Lihat detail
                            </button>
                          </div>
                        )}

                        <div style={{
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                          marginBottom: '28px', marginTop: 'auto'
                        }}>
                          <div>
                            {promo ? (
                              <>
                                <div style={{ fontSize: '0.88rem', color: C_TEXT_MUTED, textDecoration: 'line-through', marginBottom: '2px' }}>
                                  {formatPrice(promo.original_price)}
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#dc2626', letterSpacing: 0, lineHeight: 1 }}>
                                  {formatPrice(promo.promo_price)}
                                </div>
                              </>
                            ) : hasNewcomerPrice ? (
                              <>
                                <div style={{ fontSize: '0.88rem', color: C_TEXT_MUTED, textDecoration: 'line-through', marginBottom: '2px' }}>
                                  {formatPrice(product.price)}
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: C_BLUE, letterSpacing: 0, lineHeight: 1 }}>
                                  {formatPrice(product.newcomer_price!)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: C_BLUE_HOVER, fontWeight: 600, marginTop: '6px' }}>
                                  {t('first_purchase')} • {t('normal_price')} {formatPrice(product.price)}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: C_TEXT, letterSpacing: 0, lineHeight: 1 }}>
                                {formatPrice(product.price)}
                              </div>
                            )}
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.88rem', color: C_TEXT, fontWeight: 600, marginBottom: '6px' }}>
                              {product.duration_days} {t('days')}
                            </div>
                            <div style={{
                              fontSize: '0.78rem', color: C_TEXT_MUTED, background: C_SURFACE,
                              border: `1px solid ${C_BORDER}`,
                              padding: '5px 12px', borderRadius: '10px', display: 'inline-block',
                              textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px'
                            }}>
                              {product.account_type}
                            </div>
                            <div style={{
                              fontSize: '0.72rem',
                              color: availableStock === 0 ? 'var(--text-muted)' : 'var(--brand-success)',
                              fontWeight: 700,
                              marginTop: '7px',
                            }}>
                              {isUnavailable ? 'Stok habis' : `Stok ${availableStock}`}
                            </div>
                          </div>
                        </div>

                        {isUnavailable ? (
                          <button
                            disabled
                            className="btn"
                            style={{
                              width: '100%',
                              background: C_SURFACE,
                              color: 'var(--text-muted)',
                              border: `1px solid ${C_BORDER}`,
                              cursor: 'not-allowed',
                            }}
                          >
                            SOLD OUT
                          </button>
                        ) : (
                          <Link
                            href={`/order/${product.id}`}
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                          >{t('choose_plan')}</Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      </main>

      <>
        {detailProduct && (
          <div
            className="product-detail-overlay"
            onClick={() => setDetailProduct(null)}
          >
            <div
              className="product-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-detail-title"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="product-detail-close"
                onClick={() => setDetailProduct(null)}
                aria-label="Tutup detail produk"
              >
                <FiX aria-hidden="true" focusable="false" />
              </button>

              <div className="product-detail-kicker">{detailProduct.platform_name}</div>
              <h3 id="product-detail-title" className="product-detail-title">{detailProduct.name}</h3>
              <div className="product-detail-content">
                {detailProduct.description}
              </div>

              <div className="product-detail-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDetailProduct(null)}
                >
                  Tutup
                </button>
                {!isProductUnavailable(detailProduct) ? (
                  <Link
                    href={`/order/${detailProduct.id}`}
                    className="btn btn-primary"
                    onClick={() => setDetailProduct(null)}
                  >
                    {t('choose_plan')}
                  </Link>
                ) : (
                  <button type="button" className="btn" disabled>
                    SOLD OUT
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </>

      <HelpPopup
        open={helpOpen}
        loading={helpLoading}
        whatsappUrl={waUrl}
        groupUrl={whatsappGroupUrl}
        onClose={() => setHelpOpen(false)}
      />

      {/* Floating WA button */}
      {hasHelpOption && (
        <button
          type="button"
          onClick={openHelpPopup}
          style={{
            position: 'fixed', bottom: 'calc(20px + env(safe-area-inset-bottom))', right: '16px', zIndex: 200,
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#08753f', color: '#fff',
            padding: '12px 16px', borderRadius: '30px',
            fontWeight: 600, fontSize: '0.85rem',
            textDecoration: 'none', border: 0, cursor: 'pointer',
            boxShadow: '0 14px 30px rgba(37,211,102,0.24)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
        >
          <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          {t('help')}
        </button>
      )}

      {/* Footer */}
      <footer style={{
        padding: '48px 20px',
        borderTop: `1px solid ${C_BORDER}`,
        textAlign: 'center', background: 'var(--bg-card)',
        position: 'relative', zIndex: 1
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', marginBottom: '20px',
        }}>
          <span style={{ fontWeight: 800, fontSize: '1rem', color: C_TEXT, letterSpacing: 0 }}>PastiPremium</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '24px', marginBottom: '24px', flexWrap: 'wrap',
        }}>
          <Link href="/ketentuan" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>Ketentuan &amp; Garansi</Link>
          <Link href="/warranty" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>Klaim Garansi</Link>
          <Link href="/refund" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>Ajukan Refund</Link>
          <Link href="/buyer/lookup" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>Cek Pesanan</Link>
          <Link href="/reseller/login" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>Mitra Reseller</Link>
        </div>
        <p style={{ fontSize: '0.8rem', color: C_TEXT_MUTED, margin: 0, fontWeight: 400, opacity: 0.8 }}>
          {t('footer_copyright')}
        </p>
        {!isIDR && (
          <p style={{ fontSize: '0.75rem', color: C_TEXT_MUTED, margin: '8px 0 0', fontWeight: 500 }}>
            {t('currency_note', { currency })}
          </p>
        )}
      </footer>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }

        .platform-card {
          appearance: none;
          color: inherit;
          font: inherit;
          width: 100%;
        }

        .platform-card:hover,
        .platform-card:focus-visible {
          transform: translateY(-4px);
          border-color: var(--border-hover) !important;
          box-shadow: var(--shadow-lg) !important;
        }

        .product-card:not([data-inactive="true"]):hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg) !important;
        }

        .product-description-preview {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .product-detail-button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          border: 1px solid var(--border-primary);
          border-radius: 10px;
          background: var(--bg-secondary);
          color: var(--accent);
          padding: 8px 11px;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .product-detail-button:hover {
          background: var(--accent-soft);
          border-color: rgba(37, 99, 235, 0.25);
          color: var(--accent-hover);
        }

        .product-detail-overlay {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(15, 23, 42, 0.56);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .product-detail-modal {
          position: relative;
          width: min(100%, 620px);
          max-height: min(82vh, 720px);
          overflow: auto;
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-2xl);
          background: var(--bg-card);
          box-shadow: var(--shadow-lg);
          padding: 30px;
        }

        .product-detail-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-primary);
          border-radius: 999px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .product-detail-close:hover {
          color: var(--text-primary);
          background: var(--bg-card-hover);
        }

        .product-detail-kicker {
          color: var(--text-muted);
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
          padding-right: 48px;
        }

        .product-detail-title {
          color: var(--text-primary);
          font-size: 1.45rem;
          font-weight: 800;
          line-height: 1.25;
          margin: 0 48px 18px 0;
        }

        .product-detail-content {
          white-space: pre-line;
          color: var(--text-secondary);
          font-size: 0.94rem;
          line-height: 1.72;
        }

        .product-detail-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 26px;
          flex-wrap: wrap;
        }

        @media (max-width: 560px) {
          .platform-card {
          appearance: none;
          color: inherit;
          font: inherit;
          width: 100%;
        }

        .platform-card:hover,
        .platform-card:focus-visible {
          transform: translateY(-4px);
          border-color: var(--border-hover) !important;
          box-shadow: var(--shadow-lg) !important;
        }

        .product-card:not([data-inactive="true"]):hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg) !important;
        }

        .product-description-preview {
            -webkit-line-clamp: 2;
          }

          .product-detail-overlay {
            align-items: flex-end;
            padding: 12px;
          }

          .product-detail-modal {
            max-height: 86vh;
            border-radius: 20px;
            padding: 24px 20px 20px;
          }

          .product-detail-title {
            font-size: 1.2rem;
            margin-right: 42px;
          }

          .product-detail-actions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .product-detail-actions .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
