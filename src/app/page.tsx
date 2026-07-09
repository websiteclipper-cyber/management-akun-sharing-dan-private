'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';
import Link from 'next/link';
import PromoPopup from '@/components/PromoPopup';
import GlobalPromoPopup from '@/components/GlobalPromoPopup';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLocale } from '@/lib/locale-context';
import { SiNetflix, SiSpotify, SiYoutube, SiApple, SiCanva, SiGooglegemini } from 'react-icons/si';
import { BsDisplay, BsStars } from 'react-icons/bs';
import { FiInfo, FiMonitor, FiX } from 'react-icons/fi';
import { TbBrandOpenai, TbBrandDisney, TbBrandAmazon, TbRobot, TbScissors, TbPhotoVideo } from 'react-icons/tb';
import { motion, AnimatePresence, Variants } from 'framer-motion';

interface Promo {
  id: string;
  product_id: number;
  promo_label: string;
  original_price: number;
  promo_price: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface LeaderboardEntry {
  mitra_name: string;
  commission_today: number;
  rank_position: number;
  avatar_emoji: string;
}

interface BuyerSession {
  id: number;
  name: string;
  email: string;
  phone: string;
}

// ── Squircle platform icons (white icon on brand gradient) ──
const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  NETFLIX: <SiNetflix color="#fff" />,
  SPOTIFY: <SiSpotify color="#fff" />,
  YOUTUBE: <SiYoutube color="#fff" />,
  DISNEY: <TbBrandDisney color="#fff" />,
  VIDIO: <FiMonitor color="#fff" />,
  VIU: <BsDisplay color="#fff" />,
  PRIME: <TbBrandAmazon color="#fff" />,
  APPLE: <SiApple color="#fff" />,
  CANVA: <SiCanva color="#fff" />,
  CHATGPT: <TbBrandOpenai color="#fff" />,
  GEMINI: <SiGooglegemini color="#fff" />,
  GROK: <TbRobot color="#fff" />,
  CAPCUT: <TbScissors color="#fff" />,
  WINK: <TbPhotoVideo color="#fff" />,
  DEFAULT: <BsStars color="#fff" />,
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

// ── Medal styles for leaderboard ──
const MEDAL_STYLES: Record<number, { bg: string; shadow: string; label: string }> = {
  1: { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', shadow: '0 4px 16px rgba(255,215,0,0.45)', label: '🥇' },
  2: { bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', shadow: '0 4px 16px rgba(192,192,192,0.4)', label: '🥈' },
  3: { bg: 'linear-gradient(135deg, #CD7F32, #A0522D)', shadow: '0 4px 16px rgba(205,127,50,0.4)', label: '🥉' },
};

// ── Animation variants ──
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

export default function HomePage() {
  const { t, formatPrice, isIDR, currency } = useLocale();
  const [products, setProducts] = useState<Product[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [supportWa, setSupportWa] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  async function loadProducts() {
    const now = new Date().toISOString();
    const [{ data: pData }, { data: promoData }] = await Promise.all([
      supabase.from('products').select('*').in('status', ['active', 'inactive']).order('platform_name', { ascending: true }),
      supabase.from('promos').select('*').eq('is_active', true).lte('start_date', now).gte('end_date', now),
    ]);
    setProducts(pData || []);
    setPromos(promoData || []);
    setLoading(false);
  }

  useEffect(() => {
    const initProducts = async () => {
      await loadProducts();
    };
    void initProducts();

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

    fetch('/api/public/settings')
      .then(r => r.json())
      .then(d => setSupportWa(d.support_whatsapp || ''))
      .catch(() => {});

    fetch('/api/public/leaderboard')
      .then(r => r.json())
      .then(d => setLeaderboard(d.entries || []))
      .catch(() => {});
  }, []);

  function handleLogout() {
    localStorage.removeItem('buyer_session');
    setBuyer(null);
    setMenuOpen(false);
  }

  const categories = Array.from(new Set(products.map(p => p.platform_name.toUpperCase())));
  const waUrl = supportWa
    ? `https://wa.me/${supportWa.startsWith('0') ? '62' + supportWa.substring(1) : supportWa}?text=${encodeURIComponent('Hi admin pastipremium.my.id, I need help.')}`
    : null;

  // Modern clean color system
  const C_BG = 'var(--bg-base)';
  const C_TEXT = 'var(--text-primary)';
  const C_TEXT_MUTED = 'var(--text-secondary)';
  const C_BLUE = 'var(--accent)';
  const C_BLUE_HOVER = 'var(--accent-hover)';
  const C_CARD = 'var(--bg-card)';
  const C_SHADOW = 'var(--shadow-md)';
  const C_SHADOW_HOVER = 'var(--shadow-lg)';
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
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: C_TEXT,
      position: 'relative',
      maxWidth: '100vw',
      overflowX: 'hidden',
    }}>
      <PromoPopup />
      <GlobalPromoPopup onSelectPlatform={(platform) => {
        setSelectedCategory(platform.toUpperCase());
        const el = document.getElementById('katalog');
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }} />

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
            className="mobile-menu-btn"
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed', top: '68px', left: 0, right: 0,
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(18px)',
              borderBottom: '1px solid var(--border-primary)',
              padding: '20px 24px',
              zIndex: 99,
              display: 'flex', flexDirection: 'column', gap: '20px',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <Link href="/ketentuan" onClick={() => setMenuOpen(false)} style={{ color: C_TEXT, textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>Ketentuan</Link>
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <section
        ref={heroRef}
        style={{
          padding: '88px 20px 64px',
          textAlign: 'center',
          maxWidth: '920px', margin: '0 auto',
          position: 'relative',
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: '3.3rem',
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
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: '1.15rem', color: C_TEXT_MUTED,
            lineHeight: 1.6, maxWidth: '520px',
            margin: '0 auto 40px', fontWeight: 400,
            position: 'relative', zIndex: 1,
          }}
        >
          {t('hero_subtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
          {waUrl && (
            <a
              href={waUrl} target="_blank" rel="noopener noreferrer"
              style={{
                background: C_CARD, color: C_TEXT,
                border: `1px solid ${C_BORDER}`,
                padding: '15px 30px', borderRadius: '12px',
                fontSize: '1rem', fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.25s ease',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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
            >{t('help')}</a>
          )}
        </motion.div>
      </section>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section style={{ padding: '0 24px 60px', maxWidth: '1050px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
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
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.08 }}
                    whileHover={{ y: -2, background: 'var(--bg-card-hover)', borderColor: 'var(--border-hover)' }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '16px 20px', borderRadius: '14px',
                      background: isTopThree ? C_SURFACE : '#fff',
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
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
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

        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: C_TEXT_MUTED }}>
            <h3 style={{ fontWeight: 700, fontSize: '1.3rem', marginBottom: '8px', color: C_TEXT }}>{t('catalog_empty_title')}</h3>
            <p>{t('catalog_empty_desc')}</p>
          </div>

        ) : (
          <AnimatePresence mode="wait">
            {!selectedCategory ? (
              <motion.div
                key="categories"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div style={{ marginBottom: '44px', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: 0, marginBottom: '10px', color: C_TEXT }}>
                    {t('choose_platform')}
                  </h2>
                  <p style={{ fontSize: '1.05rem', color: C_TEXT_MUTED }}>{t('categories_available', { count: categories.length })}</p>
                </div>
                
                {(() => {
                  const GROUPS = [
                    { id: 'ai', title: '🤖 AI & Produktivitas', items: ['CHATGPT', 'CLAUDE', 'GEMINI', 'GROK', 'LEONARDO'] },
                    { id: 'editing', title: '🎨 Editing & Desain', items: ['CANVA', 'CAPCUT', 'WINK'] },
                    { id: 'music', title: '🎵 Musik & Audio', items: ['SPOTIFY', 'APPLE'] },
                    { id: 'streaming', title: '🍿 Streaming & Hiburan', items: ['NETFLIX', 'YOUTUBE', 'DISNEY', 'VIDIO', 'VIU', 'PRIME'] }
                  ];

                  const groupedCategories: { title: string, platforms: string[] }[] = [];
                  const unassigned = [...categories];

                  GROUPS.forEach(g => {
                    const matched = unassigned.filter(c => g.items.some(item => c.includes(item)));
                    if (matched.length > 0) {
                      groupedCategories.push({ title: g.title, platforms: matched });
                      matched.forEach(m => {
                        const idx = unassigned.indexOf(m);
                        if (idx > -1) unassigned.splice(idx, 1);
                      });
                    }
                  });

                  if (unassigned.length > 0) {
                    groupedCategories.push({ title: '📦 Kategori Lainnya', platforms: unassigned });
                  }

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
                              const count = products.filter(p => p.platform_name.toUpperCase() === category).length;
                              const icon = getPlatformIcon(category);
                              const gradient = getPlatformGradient(category);
                              const glowColor = getPlatformGlow(category);
                              
                              return (
                                <motion.div
                                  key={category}
                                  variants={itemVariants}
                                  onClick={() => setSelectedCategory(category)}
                                  whileHover={{ 
                                    y: -4, 
                                    borderColor: glowColor.replace('0.15', '0.4').replace('0.12', '0.35').replace('0.08', '0.2').replace('0.1', '0.3'),
                                    boxShadow: `0 18px 36px ${glowColor}`
                                  }}
                                  whileTap={{ scale: 0.97 }}
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
                                  <div style={{
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
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>
            ) : (
              <motion.div
                key="products"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                {/* Category Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '20px',
                  marginBottom: '40px', borderBottom: `1px solid ${C_BORDER}`, paddingBottom: '28px'
                }}>
                  <motion.button
                    whileHover={{ scale: 1.04, background: 'var(--bg-card-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedCategory(null)}
                    style={{
                      width: '42px', height: '42px',
                      background: C_CARD, borderRadius: '12px',
                      cursor: 'pointer', color: C_TEXT, border: `1px solid ${C_BORDER}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.3rem', flexShrink: 0, transition: 'all 0.2s ease',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >←</motion.button>
                  <div>
                    <h2 style={{
                      fontSize: '2rem', fontWeight: 800, letterSpacing: 0, marginBottom: '2px',
                      display: 'flex', alignItems: 'center', gap: '14px', color: C_TEXT
                    }}>
                      {/* Smaller squircle icon in header */}
                      <span style={{
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
                      if (a.status === 'active' && b.status === 'inactive') return -1;
                      if (a.status === 'inactive' && b.status === 'active') return 1;
                      
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
                      const isInactive = product.status === 'inactive';

                      return (
                        <motion.div
                          key={product.id}
                          variants={itemVariants}
                          whileHover={isInactive ? {} : { 
                            y: -4, 
                            borderColor: promo 
                              ? 'rgba(239, 68, 68, 0.4)' 
                              : hasNewcomerPrice 
                              ? 'rgba(59, 130, 246, 0.4)' 
                              : 'var(--border-hover)',
                            boxShadow: promo 
                              ? '0 18px 38px rgba(239, 68, 68, 0.12)' 
                              : hasNewcomerPrice 
                              ? '0 18px 38px rgba(37, 99, 235, 0.12)' 
                              : C_SHADOW_HOVER
                          }}
                          style={{
                            background: C_CARD,
                            borderRadius: 'var(--radius-xl)',
                            padding: '32px',
                            boxShadow: isInactive
                              ? 'none'
                              : promo
                              ? '0 14px 34px rgba(239, 68, 68, 0.08)'
                              : hasNewcomerPrice
                              ? '0 14px 34px rgba(37, 99, 235, 0.08)'
                              : C_SHADOW,
                            border: isInactive
                              ? '1px solid var(--border-secondary)'
                              : promo
                              ? '1px solid rgba(239, 68, 68, 0.2)'
                              : hasNewcomerPrice
                              ? '1px solid rgba(37, 99, 235, 0.18)'
                              : `1px solid ${C_BORDER}`,
                            display: 'flex', flexDirection: 'column',
                            position: 'relative',
                            transition: 'all var(--transition-normal)',
                            opacity: isInactive ? 0.55 : 1,
                            filter: isInactive ? 'grayscale(80%)' : 'none',
                          }}
                        >
                        {/* Sold Out or Promo/Newcomer Badge */}
                        {isInactive ? (
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
                              <FiInfo />
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
                          </div>
                        </div>

                        {isInactive ? (
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
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </section>

      <AnimatePresence>
        {detailProduct && (
          <motion.div
            className="product-detail-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDetailProduct(null)}
          >
            <motion.div
              className="product-detail-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-detail-title"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="product-detail-close"
                onClick={() => setDetailProduct(null)}
                aria-label="Tutup detail produk"
              >
                <FiX />
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
                {detailProduct.status === 'active' && (
                  <Link
                    href={`/order/${detailProduct.id}`}
                    className="btn btn-primary"
                    onClick={() => setDetailProduct(null)}
                  >
                    {t('choose_plan')}
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating WA button */}
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'fixed', bottom: '20px', right: '16px', zIndex: 200,
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#25D366', color: '#fff',
            padding: '12px 16px', borderRadius: '30px',
            fontWeight: 600, fontSize: '0.85rem',
            textDecoration: 'none',
            boxShadow: '0 14px 30px rgba(37,211,102,0.24)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          {t('help')}
        </a>
      )}

      {/* Footer */}
      <footer style={{
        padding: '48px 20px',
        borderTop: `1px solid ${C_BORDER}`,
        textAlign: 'center', background: '#ffffff',
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
          <Link href="/buyer/lookup" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>Cek Pesanan</Link>
          <Link href="/reseller/login" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = C_TEXT} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>Mitra Reseller</Link>
        </div>
        <p style={{ fontSize: '0.8rem', color: C_TEXT_MUTED, margin: 0, fontWeight: 400, opacity: 0.8 }}>
          {t('footer_copyright')}
        </p>
        {!isIDR && (
          <p style={{ fontSize: '0.75rem', color: C_TEXT_MUTED, margin: '8px 0 0', fontWeight: 400, opacity: 0.6 }}>
            {t('currency_note', { currency })}
          </p>
        )}
      </footer>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }

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
