'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';
import Link from 'next/link';
import PromoPopup from '@/components/PromoPopup';
import { SiNetflix, SiSpotify, SiYoutube, SiApple, SiCanva, SiGooglegemini } from 'react-icons/si';
import { BsDisplay, BsStars } from 'react-icons/bs';
import { FiMonitor } from 'react-icons/fi';
import { TbBrandOpenai, TbBrandDisney, TbBrandAmazon, TbRobot, TbScissors, TbPhotoVideo } from 'react-icons/tb';
import { motion, AnimatePresence } from 'framer-motion';

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
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

export default function HomePage() {
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
    const [{ data: pData }, { data: promoData }] = await Promise.all([
      supabase.from('products').select('*').eq('status', 'active').order('platform_name', { ascending: true }),
      supabase.from('promos').select('*').eq('is_active', true),
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

  function formatPrice(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  function handleLogout() {
    localStorage.removeItem('buyer_session');
    setBuyer(null);
    setMenuOpen(false);
  }

  const categories = Array.from(new Set(products.map(p => p.platform_name.toUpperCase())));
  const waUrl = supportWa
    ? `https://wa.me/${supportWa.startsWith('0') ? '62' + supportWa.substring(1) : supportWa}?text=${encodeURIComponent('Halo admin pastipremium.store, saya butuh bantuan.')}`
    : null;

  // Apple-inspired colors
  const C_BG = '#fbfbfd';
  const C_TEXT = '#1d1d1f';
  const C_TEXT_MUTED = '#86868b';
  const C_BLUE = '#0071e3';
  const C_BLUE_HOVER = '#0077ed';
  const C_CARD = '#ffffff';
  const C_SHADOW = '0 8px 30px rgba(0,0,0,0.04)';
  const C_SHADOW_HOVER = '0 12px 40px rgba(0,0,0,0.08)';

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

      {/* ── HEADER (Apple Glassmorphism) ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        padding: '0 16px',
        height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600, fontSize: '1.05rem', letterSpacing: '-0.01em', color: C_TEXT }}>
            PastiPremium
          </span>
        </div>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href="/reseller/login"
            style={{
              fontSize: '0.8rem', fontWeight: 500,
              color: C_TEXT_MUTED, textDecoration: 'none', transition: 'color 0.2s',
            }}
          >Mitra</Link>

          {buyer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link
                href="/buyer/lookup"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#f2f2f2', borderRadius: '20px', padding: '6px 14px',
                  fontSize: '0.8rem', fontWeight: 500, color: C_TEXT,
                  textDecoration: 'none', transition: 'background 0.2s'
                }}
              >
                Pesanan Saya
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  fontSize: '0.8rem', fontWeight: 500,
                  color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >Keluar</button>
            </div>
          ) : (
            <Link
              href="/buyer/login"
              style={{
                background: C_BLUE, color: '#fff',
                padding: '6px 16px', borderRadius: '20px',
                fontSize: '0.8rem', fontWeight: 500,
                textDecoration: 'none', transition: 'background 0.2s',
              }}
            >Login</Link>
          )}
        </div>
      </header>

      {/* ── HERO with Mesh Gradient ── */}
      <section
        ref={heroRef}
        style={{
          padding: '80px 20px 60px',
          textAlign: 'center',
          maxWidth: '800px', margin: '0 auto',
          position: 'relative',
        }}
      >
        {/* Ambient mesh gradient blobs */}
        <div style={{
          position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
          width: '120%', height: '500px', pointerEvents: 'none', zIndex: 0, overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '0', left: '10%',
            width: '380px', height: '380px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,113,227,0.12) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
          <div style={{
            position: 'absolute', top: '40px', right: '5%',
            width: '320px', height: '320px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
          <div style={{
            position: 'absolute', top: '120px', left: '35%',
            width: '260px', height: '260px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(236,72,153,0.07) 0%, transparent 70%)',
            filter: 'blur(60px)',
          }} />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 4.5rem)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            marginBottom: '20px',
            color: C_TEXT,
            position: 'relative', zIndex: 1,
          }}
        >
          Tingkatkan Produktivitas.<br/>
          Nikmati Hiburan.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            fontSize: '1.1rem', color: C_TEXT_MUTED,
            lineHeight: 1.5, maxWidth: '400px',
            margin: '0 auto 36px', fontWeight: 400,
            position: 'relative', zIndex: 1,
          }}
        >
          Solusi akun premium murah, aman, dan instan untuk menemani keseharian Anda.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ display: 'flex', gap: '12px', justifyContent: 'center', position: 'relative', zIndex: 1 }}
        >
          <button
            onClick={() => {
              const el = document.getElementById('katalog');
              if (el) {
                const y = el.getBoundingClientRect().top + window.scrollY - 70;
                window.scrollTo({ top: y, behavior: 'smooth' });
              }
            }}
            style={{
              background: C_BLUE, color: '#fff', border: 'none',
              padding: '14px 28px', borderRadius: '30px',
              fontSize: '0.95rem', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >Lihat Katalog</button>
          {waUrl && (
            <a
              href={waUrl} target="_blank" rel="noopener noreferrer"
              style={{
                background: 'rgba(0,0,0,0.05)', color: C_TEXT,
                border: 'none',
                padding: '14px 28px', borderRadius: '30px',
                fontSize: '0.95rem', fontWeight: 500,
                textDecoration: 'none', transition: 'all 0.2s',
              }}
            >Bantuan</a>
          )}
        </motion.div>
      </section>

      {/* ── LEADERBOARD (Apple Fitness Medals) ── */}
      {leaderboard.length > 0 && (
        <section style={{ padding: '0 20px 40px', maxWidth: '1000px', margin: '0 auto' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{
              background: C_CARD,
              borderRadius: '24px',
              padding: '28px 32px',
              boxShadow: C_SHADOW,
              border: '1px solid rgba(0,0,0,0.03)',
              display: 'flex', flexDirection: 'column', gap: '20px',
              position: 'relative', overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.01em', marginBottom: '4px' }}>Top Partners</h3>
                <p style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, margin: 0 }}>Komisi harian tertinggi hari ini.</p>
              </div>
              <Link href="/reseller/register" style={{ fontSize: '0.85rem', fontWeight: 500, color: C_BLUE, textDecoration: 'none' }}>
                Join Program →
              </Link>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              {leaderboard.map((entry, idx) => {
                const medal = MEDAL_STYLES[entry.rank_position];
                const isTopThree = entry.rank_position <= 3;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.08 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '14px 16px', borderRadius: '16px',
                      background: isTopThree ? 'rgba(0,0,0,0.02)' : 'transparent',
                    }}
                  >
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: medal ? medal.bg : '#f2f2f2',
                      boxShadow: medal ? medal.shadow : 'none',
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: medal ? '1.2rem' : '0.9rem',
                      fontWeight: 600,
                      color: medal ? '#fff' : C_TEXT_MUTED,
                    }}>
                      {medal ? medal.label : entry.rank_position}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600, fontSize: '0.95rem', color: C_TEXT,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {entry.avatar_emoji} {entry.mitra_name}
                      </div>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem', color: C_TEXT_MUTED }}>
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
      <section id="katalog" style={{ padding: '0 20px 100px', maxWidth: '1200px', margin: '0 auto' }}>
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '200px', flexDirection: 'column', gap: '16px',
          }}>
            <div style={{ width: '24px', height: '24px', border: '3px solid #f2f2f2', borderTopColor: C_BLUE, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          </div>

        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: C_TEXT_MUTED }}>
            <h3 style={{ fontWeight: 600, fontSize: '1.2rem', marginBottom: '8px', color: C_TEXT }}>Katalog Kosong</h3>
            <p>Produk belum ditambahkan oleh admin.</p>
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
                <div style={{ marginBottom: '32px', textAlign: 'center' }}>
                  <h2 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '8px' }}>
                    Pilih Platform.
                  </h2>
                  <p style={{ fontSize: '1rem', color: C_TEXT_MUTED }}>Tersedia {categories.length} kategori eksklusif.</p>
                </div>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '20px',
                }}>
                  {categories.map(category => {
                    const count = products.filter(p => p.platform_name.toUpperCase() === category).length;
                    const icon = getPlatformIcon(category);
                    const gradient = getPlatformGradient(category);
                    return (
                      <motion.div
                        key={category}
                        variants={itemVariants}
                        onClick={() => setSelectedCategory(category)}
                        whileHover={{ y: -6, boxShadow: C_SHADOW_HOVER }}
                        whileTap={{ scale: 0.97 }}
                        style={{
                          background: C_CARD,
                          borderRadius: '24px',
                          padding: '28px 24px',
                          cursor: 'pointer',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                          transition: 'box-shadow 0.3s ease',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                          border: '1px solid rgba(0,0,0,0.04)'
                        }}
                      >
                        {/* Squircle icon with brand gradient */}
                        <div style={{
                          width: '64px', height: '64px',
                          borderRadius: '18px',
                          background: gradient,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '2rem', marginBottom: '16px',
                          boxShadow: `0 6px 20px ${gradient.includes('#E50914') ? 'rgba(229,9,20,0.3)'
                            : gradient.includes('#1DB954') ? 'rgba(29,185,84,0.3)'
                            : gradient.includes('#FF0000') ? 'rgba(255,0,0,0.25)'
                            : gradient.includes('#113CCF') ? 'rgba(17,60,207,0.25)'
                            : gradient.includes('#00C4CC') ? 'rgba(0,196,204,0.25)'
                            : gradient.includes('#10A37F') ? 'rgba(16,163,127,0.25)'
                            : gradient.includes('#8E75B2') ? 'rgba(142,117,178,0.25)'
                            : 'rgba(0,0,0,0.12)'}`,
                        }}>{icon}</div>

                        <h3 style={{ fontWeight: 600, fontSize: '1.2rem', color: C_TEXT, marginBottom: '4px' }}>
                          {category}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, fontWeight: 400, }}>
                          {count} varian tersedia
                        </p>
                      </motion.div>
                    );
                  })}
                </div>
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
                  display: 'flex', alignItems: 'center', gap: '16px',
                  marginBottom: '32px', borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: '24px'
                }}>
                  <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedCategory(null)}
                    style={{
                      width: '40px', height: '40px',
                      background: '#f2f2f2', borderRadius: '50%',
                      cursor: 'pointer', color: C_TEXT, border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.2rem', flexShrink: 0, transition: 'background 0.2s'
                    }}
                  >←</motion.button>
                  <div>
                    <h2 style={{
                      fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '2px',
                      display: 'flex', alignItems: 'center', gap: '12px'
                    }}>
                      {/* Smaller squircle icon in header */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: getPlatformGradient(selectedCategory),
                        fontSize: '1.1rem',
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
                  gap: '24px' 
                }}>
                  {products.filter(p => p.platform_name.toUpperCase() === selectedCategory).map((product, idx) => {
                    const promo = promos.find(pr => {
                      const now = new Date();
                      return pr.product_id === product.id &&
                        new Date(pr.start_date) <= now &&
                        new Date(pr.end_date) >= now;
                    });

                    const hasNewcomerPrice = product.newcomer_price !== null && product.newcomer_price !== undefined;

                    return (
                      <motion.div
                        key={product.id}
                        variants={itemVariants}
                        whileHover={{ y: -4 }}
                        style={{
                          background: C_CARD,
                          borderRadius: '24px',
                          padding: '28px',
                          boxShadow: promo
                            ? '0 8px 30px rgba(239,68,68,0.10), 0 0 0 1px rgba(239,68,68,0.15)'
                            : hasNewcomerPrice
                            ? '0 8px 30px rgba(59,130,246,0.10), 0 0 0 1px rgba(59,130,246,0.12)'
                            : C_SHADOW,
                          border: promo
                            ? '1px solid rgba(239,68,68,0.2)'
                            : hasNewcomerPrice
                            ? '1px solid rgba(59,130,246,0.15)'
                            : '1px solid rgba(0,0,0,0.03)',
                          display: 'flex', flexDirection: 'column',
                          position: 'relative',
                          transition: 'box-shadow 0.3s ease',
                        }}
                      >
                        {/* Promo badge — Glassmorphism */}
                        {promo && (
                          <div style={{
                            position: 'absolute', top: '-12px', left: '28px',
                            background: 'rgba(239,68,68,0.9)',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            color: '#fff',
                            padding: '5px 14px', borderRadius: '12px',
                            fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            boxShadow: '0 4px 16px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                          }}>
                            {promo.promo_label}
                          </div>
                        )}

                        {/* Newcomer badge — Glassmorphism */}
                        {hasNewcomerPrice && !promo && (
                          <div style={{
                            position: 'absolute', top: '-12px', left: '28px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(99,102,241,0.9))',
                            backdropFilter: 'blur(8px)',
                            WebkitBackdropFilter: 'blur(8px)',
                            color: '#fff',
                            padding: '5px 14px', borderRadius: '12px',
                            fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            boxShadow: '0 4px 16px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
                          }}>
                            🆕 Harga Buyer Baru
                          </div>
                        )}

                        <div style={{
                          fontSize: '0.75rem', fontWeight: 600, color: C_TEXT_MUTED,
                          textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px',
                          marginTop: (promo || hasNewcomerPrice) ? '8px' : '0'
                        }}>
                          {product.platform_name}
                        </div>
                        
                        <h3 style={{
                          fontSize: '1.25rem', fontWeight: 600, color: C_TEXT,
                          marginBottom: '12px', lineHeight: 1.3, letterSpacing: '-0.01em'
                        }}>{product.name}</h3>

                        {product.description && (
                          <p style={{
                            fontSize: '0.9rem', color: C_TEXT_MUTED,
                            marginBottom: '24px', lineHeight: 1.5, flex: 1,
                          }}>{product.description}</p>
                        )}

                        <div style={{
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                          marginBottom: '24px', marginTop: 'auto'
                        }}>
                          <div>
                            {promo ? (
                              <>
                                <div style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'line-through', marginBottom: '2px' }}>
                                  {formatPrice(promo.original_price)}
                                </div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                  {formatPrice(promo.promo_price)}
                                </div>
                              </>
                            ) : hasNewcomerPrice ? (
                              <>
                                <div style={{ fontSize: '0.85rem', color: C_TEXT_MUTED, textDecoration: 'line-through', marginBottom: '2px' }}>
                                  {formatPrice(product.price)}
                                </div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#3b82f6', letterSpacing: '-0.02em', lineHeight: 1 }}>
                                  {formatPrice(product.newcomer_price!)}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#6366f1', fontWeight: 500, marginTop: '4px' }}>
                                  Pembelian pertama • Normal {formatPrice(product.price)}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: C_TEXT, letterSpacing: '-0.02em', lineHeight: 1 }}>
                                {formatPrice(product.price)}
                              </div>
                            )}
                          </div>
                          
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.8rem', color: C_TEXT, fontWeight: 500, marginBottom: '4px' }}>
                              {product.duration_days} Hari
                            </div>
                            <div style={{ 
                              fontSize: '0.75rem', color: C_TEXT_MUTED, background: '#f5f5f7', 
                              padding: '4px 10px', borderRadius: '12px', display: 'inline-block',
                              textTransform: 'capitalize'
                            }}>
                              {product.account_type}
                            </div>
                          </div>
                        </div>

                        <Link
                          href={`/order/${product.id}`}
                          style={{
                            display: 'block', textAlign: 'center',
                            background: C_BLUE, color: '#fff', 
                            borderRadius: '14px', padding: '14px', 
                            fontWeight: 500, fontSize: '0.95rem',
                            textDecoration: 'none', transition: 'background 0.2s',
                            width: '100%'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = C_BLUE_HOVER}
                          onMouseLeave={(e) => e.currentTarget.style.background = C_BLUE}
                        >Pilih Paket</Link>
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
            transition: 'transform 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Bantuan
        </a>
      )}

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '32px 20px',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        textAlign: 'center', background: '#f5f5f7'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', marginBottom: '8px',
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: C_TEXT }}>PastiPremium</span>
        </div>
        <p style={{ fontSize: '0.8rem', color: C_TEXT_MUTED, margin: 0, fontWeight: 400 }}>
          Copyright © 2025 PastiPremium. Hak cipta dilindungi undang-undang.
        </p>
      </footer>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
