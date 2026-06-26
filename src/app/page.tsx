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
import { FiMonitor } from 'react-icons/fi';
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
  const [buyer, setBuyer] = useState<BuyerSession | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [supportWa, setSupportWa] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
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
    loadProducts();
    const session = localStorage.getItem('buyer_session');
    if (session) setBuyer(JSON.parse(session));

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

  function formatPriceIDR(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  function handleLogout() {
    localStorage.removeItem('buyer_session');
    setBuyer(null);
    setMenuOpen(false);
  }

  const categories = Array.from(new Set(products.map(p => p.platform_name.toUpperCase())));
  const waUrl = supportWa
    ? `https://wa.me/${supportWa.startsWith('0') ? '62' + supportWa.substring(1) : supportWa}?text=${encodeURIComponent('Hi admin pastipremium.my.id, I need help.')}`
    : null;

  // Premium Apple/Bento Box Color System
  const C_BG = 'var(--bg-base)';
  const C_TEXT = 'var(--text-primary)';
  const C_TEXT_MUTED = 'var(--text-secondary)';
  const C_BLUE = 'var(--accent)';
  const C_BLUE_HOVER = 'var(--accent-hover)';
  const C_CARD = 'var(--bg-card)';
  const C_SHADOW = 'var(--shadow-md)';
  const C_SHADOW_HOVER = 'var(--shadow-lg)';

  const BRAND_GLOWS: Record<string, string> = {
    NETFLIX: 'rgba(229, 9, 20, 0.15)',
    SPOTIFY: 'rgba(29, 185, 84, 0.15)',
    YOUTUBE: 'rgba(255, 0, 0, 0.15)',
    DISNEY: 'rgba(17, 60, 207, 0.15)',
    VIDIO: 'rgba(255, 0, 85, 0.15)',
    VIU: 'rgba(255, 204, 0, 0.12)',
    PRIME: 'rgba(0, 168, 225, 0.15)',
    APPLE: 'rgba(255, 255, 255, 0.1)',
    CANVA: 'rgba(0, 196, 204, 0.15)',
    CHATGPT: 'rgba(16, 163, 127, 0.15)',
    GEMINI: 'rgba(142, 117, 178, 0.15)',
    GROK: 'rgba(255, 255, 255, 0.08)',
    CAPCUT: 'rgba(255, 255, 255, 0.08)',
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

      {/* ── HEADER (Apple Glassmorphism) ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        borderBottom: '1px solid var(--glass-border)',
        padding: '0 24px',
        height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'all 0.3s ease',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <span style={{ 
            fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em', 
            background: 'linear-gradient(135deg, #ffffff 50%, #a29bfe 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            ✦ PastiPremium
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
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}
          >Ketentuan</Link>
          <Link
            href="/reseller/login"
            className="hide-on-mobile"
            style={{
              fontSize: '0.85rem', fontWeight: 500,
              color: C_TEXT_MUTED, textDecoration: 'none', transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}
          >{t('header_mitra')}</Link>

          {buyer ? (
            <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link
                href="/buyer/lookup"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(255, 255, 255, 0.08)', 
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '20px', padding: '8px 16px',
                  fontSize: '0.8rem', fontWeight: 600, color: '#fff',
                  textDecoration: 'none', transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
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
                padding: '8px 18px', borderRadius: '20px',
                fontSize: '0.8rem', fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C_BLUE_HOVER;
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C_BLUE;
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
              }}
            >{t('header_login')}</Link>
          )}

          {/* Mobile Menu Toggle */}
          <button 
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            style={{ marginLeft: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px' }}
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
              position: 'fixed', top: '64px', left: 0, right: 0,
              background: 'rgba(9, 9, 11, 0.98)',
              backdropFilter: 'blur(20px)',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              padding: '20px 24px',
              zIndex: 99,
              display: 'flex', flexDirection: 'column', gap: '20px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}
          >
            <Link href="/ketentuan" onClick={() => setMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>Ketentuan</Link>
            <Link href="/reseller/login" onClick={() => setMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>{t('header_mitra')}</Link>
            
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />
            
            {buyer ? (
              <>
                <Link href="/buyer/lookup" onClick={() => setMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>{t('header_my_orders')}</Link>
                <button onClick={handleLogout} style={{ color: '#ef4444', textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600, background: 'transparent', border: 'none', textAlign: 'left', padding: 0, cursor: 'pointer' }}>{t('header_logout')}</button>
              </>
            ) : (
              <Link href="/buyer/login" onClick={() => setMenuOpen(false)} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '1.1rem', fontWeight: 600 }}>{t('header_login')}</Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── HERO with Mesh Gradient ── */}
      <section
        ref={heroRef}
        style={{
          padding: '100px 20px 80px',
          textAlign: 'center',
          maxWidth: '900px', margin: '0 auto',
          position: 'relative',
        }}
      >
        {/* Ambient mesh gradient blobs - Apple Style */}
        <div style={{
          position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)',
          width: '140%', height: '600px', pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '0', left: '25%',
            width: '500px', height: '500px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0, 122, 255, 0.15) 0%, transparent 70%)',
            filter: 'blur(100px)',
          }} />
          <div style={{
            position: 'absolute', top: '50px', right: '25%',
            width: '450px', height: '450px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(90, 200, 250, 0.1) 0%, transparent 70%)',
            filter: 'blur(90px)',
          }} />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: '3.5rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: '#fff',
            marginBottom: '16px',
            position: 'relative',
            zIndex: 1,
            background: 'linear-gradient(180deg, #FFFFFF 0%, #A3A3A3 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
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
              padding: '16px 36px', borderRadius: '30px',
              fontSize: '1rem', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.25s ease',
              boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C_BLUE_HOVER;
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(59, 130, 246, 0.45)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = C_BLUE;
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.3)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >{t('view_catalog')}</button>
          {waUrl && (
            <a
              href={waUrl} target="_blank" rel="noopener noreferrer"
              style={{
                background: 'rgba(255, 255, 255, 0.06)', color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '16px 36px', borderRadius: '30px',
                fontSize: '1rem', fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.25s ease',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >{t('help')}</a>
          )}
        </motion.div>
      </section>

      {/* ── LEADERBOARD (Apple Fitness Medals) ── */}
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
              border: '1px solid var(--border-secondary)',
              display: 'flex', flexDirection: 'column', gap: '24px',
              position: 'relative', overflow: 'hidden'
            }}
          >
            {/* Background blur highlight for the leaderboard */}
            <div style={{
              position: 'absolute', bottom: '-80px', right: '-80px',
              width: '200px', height: '200px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(162, 155, 254, 0.08) 0%, transparent 70%)',
              filter: 'blur(40px)', pointerEvents: 'none'
            }} />

            <div style={{ 
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', 
              borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px',
              flexWrap: 'wrap', gap: '16px'
            }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '6px', color: '#fff' }}>{t('leaderboard_title')}</h3>
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
                    whileHover={{ scale: 1.02, background: 'rgba(255,255,255,0.03)' }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '16px 20px', borderRadius: '18px',
                      background: isTopThree ? 'rgba(255,255,255,0.02)' : 'transparent',
                      border: '1px solid rgba(255,255,255,0.04)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{
                      width: '46px', height: '46px', borderRadius: '50%',
                      background: medal ? medal.bg : 'rgba(255,255,255,0.05)',
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
                        fontWeight: 700, fontSize: '1rem', color: '#fff',
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

      {/* ── KATALOG with AnimatePresence ── */}
      <section id="katalog" style={{ padding: '0 24px 100px', maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '240px', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ width: '28px', height: '28px', border: '3px solid rgba(255,255,255,0.05)', borderTopColor: C_BLUE, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>

        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: C_TEXT_MUTED }}>
            <h3 style={{ fontWeight: 700, fontSize: '1.3rem', marginBottom: '8px', color: '#fff' }}>{t('catalog_empty_title')}</h3>
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
                  <h2 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '10px', color: '#fff' }}>
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
                          <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '24px', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
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
                                    y: -8, 
                                    borderColor: glowColor.replace('0.15', '0.4').replace('0.12', '0.35').replace('0.08', '0.2').replace('0.1', '0.3'),
                                    boxShadow: `0 12px 40px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.03)`
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
                                    border: '1px solid var(--border-secondary)'
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

                                  <h3 style={{ fontWeight: 700, fontSize: '1.25rem', color: '#fff', marginBottom: '6px' }}>
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
                  marginBottom: '40px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '28px'
                }}>
                  <motion.button
                    whileHover={{ scale: 1.08, background: 'rgba(255, 255, 255, 0.15)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedCategory(null)}
                    style={{
                      width: '42px', height: '42px',
                      background: 'rgba(255,255,255,0.08)', borderRadius: '50%',
                      cursor: 'pointer', color: '#fff', border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.3rem', flexShrink: 0, transition: 'all 0.2s ease'
                    }}
                  >←</motion.button>
                  <div>
                    <h2 style={{
                      fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '2px',
                      display: 'flex', alignItems: 'center', gap: '14px', color: '#fff'
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
                    .map((product, idx) => {
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
                            y: -6, 
                            borderColor: promo 
                              ? 'rgba(239, 68, 68, 0.4)' 
                              : hasNewcomerPrice 
                              ? 'rgba(59, 130, 246, 0.4)' 
                              : 'rgba(255, 255, 255, 0.15)',
                            boxShadow: promo 
                              ? '0 12px 40px rgba(239, 68, 68, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.03)' 
                              : hasNewcomerPrice 
                              ? '0 12px 40px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.03)' 
                              : C_SHADOW_HOVER
                          }}
                          style={{
                            background: C_CARD,
                            borderRadius: 'var(--radius-xl)',
                            padding: '32px',
                            boxShadow: isInactive
                              ? 'none'
                              : promo
                              ? '0 8px 30px rgba(239, 68, 68, 0.08), inset 0 0 0 1px rgba(239, 68, 68, 0.15)'
                              : hasNewcomerPrice
                              ? '0 8px 30px rgba(0, 122, 255, 0.08), inset 0 0 0 1px rgba(0, 122, 255, 0.15)'
                              : C_SHADOW,
                            border: isInactive
                              ? '1px solid rgba(255, 255, 255, 0.05)'
                              : promo
                              ? '1px solid rgba(239, 68, 68, 0.2)'
                              : hasNewcomerPrice
                              ? '1px solid rgba(0, 122, 255, 0.2)'
                              : '1px solid var(--border-secondary)',
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
                            background: 'rgba(63, 63, 70, 0.95)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            color: '#d4d4d8',
                            padding: '6px 16px', borderRadius: '12px',
                            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
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
                                boxShadow: '0 4px 16px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                              }}>
                                {promo.promo_label}
                              </div>
                            )}

                            {/* Newcomer badge — Glassmorphism */}
                            {hasNewcomerPrice && !promo && (
                              <div style={{
                                position: 'absolute', top: '-14px', left: '32px',
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.95), rgba(99,102,241,0.95))',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                color: '#fff',
                                padding: '6px 16px', borderRadius: '12px',
                                fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                                boxShadow: '0 4px 16px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
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
                          fontSize: '1.35rem', fontWeight: 700, color: '#fff',
                          marginBottom: '14px', lineHeight: 1.3, letterSpacing: '-0.02em'
                        }}>{product.name}</h3>

                        {product.description && (
                          <p style={{
                            fontSize: '0.92rem', color: C_TEXT_MUTED,
                            marginBottom: '28px', lineHeight: 1.6, flex: 1,
                          }}>{product.description}</p>
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
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                  {formatPrice(promo.promo_price)}
                                </div>
                              </>
                            ) : hasNewcomerPrice ? (
                              <>
                                <div style={{ fontSize: '0.88rem', color: C_TEXT_MUTED, textDecoration: 'line-through', marginBottom: '2px' }}>
                                  {formatPrice(product.price)}
                                </div>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                  {formatPrice(product.newcomer_price!)}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 600, marginTop: '6px' }}>
                                  {t('first_purchase')} • {t('normal_price')} {formatPrice(product.price)}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                {formatPrice(product.price)}
                              </div>
                            )}
                          </div>
                          
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.88rem', color: '#fff', fontWeight: 600, marginBottom: '6px' }}>
                              {product.duration_days} {t('days')}
                            </div>
                            <div style={{ 
                              fontSize: '0.78rem', color: C_TEXT_MUTED, background: 'rgba(255,255,255,0.06)', 
                              border: '1px solid rgba(255,255,255,0.04)',
                              padding: '5px 12px', borderRadius: '12px', display: 'inline-block',
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
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'var(--text-muted)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
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

      {/* ── FLOATING WA BUTTON ── */}
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
            boxShadow: '0 4px 20px rgba(37,211,102,0.4)',
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

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '48px 20px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        textAlign: 'center', background: '#0c0c0e',
        position: 'relative', zIndex: 1
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', marginBottom: '20px',
        }}>
          <span style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', letterSpacing: '-0.01em' }}>✦ PastiPremium</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '24px', marginBottom: '24px', flexWrap: 'wrap',
        }}>
          <Link href="/ketentuan" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>⚠️ Ketentuan &amp; Garansi</Link>
          <Link href="/warranty" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>🛡️ Klaim Garansi</Link>
          <Link href="/buyer/lookup" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>📦 Cek Pesanan</Link>
          <Link href="/reseller/login" style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#fff'} onMouseLeave={(e) => e.currentTarget.style.color = C_TEXT_MUTED}>🤝 Mitra Reseller</Link>
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
      `}</style>
    </div>
  );
}
