'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';
import Link from 'next/link';
import PromoPopup from '@/components/PromoPopup';

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

const PLATFORM_EMOJI: Record<string, string> = {
  NETFLIX: '🎥', SPOTIFY: '🎧', YOUTUBE: '▶️', DISNEY: '🏰',
  VIDIO: '📺', VIU: '🎭', PRIME: '📦', APPLE: '🍎',
  CANVA: '🎨', CHATGPT: '🤖', DEFAULT: '💎',
};

function getPlatformEmoji(name: string) {
  const upper = name.toUpperCase();
  for (const [key, emoji] of Object.entries(PLATFORM_EMOJI)) {
    if (upper.includes(key)) return emoji;
  }
  return PLATFORM_EMOJI.DEFAULT;
}

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyer, setBuyer] = useState<BuyerSession | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [supportWa, setSupportWa] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);

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

  async function loadProducts() {
    const [{ data: pData }, { data: promoData }] = await Promise.all([
      supabase.from('products').select('*').eq('status', 'active').order('platform_name', { ascending: true }),
      supabase.from('promos').select('*').eq('is_active', true),
    ]);
    setProducts(pData || []);
    setPromos(promoData || []);
    setLoading(false);
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  }

  function handleLogout() {
    localStorage.removeItem('buyer_session');
    setBuyer(null);
  }

  const categories = Array.from(new Set(products.map(p => p.platform_name.toUpperCase())));
  const waUrl = supportWa
    ? `https://wa.me/${supportWa.startsWith('0') ? '62' + supportWa.substring(1) : supportWa}?text=${encodeURIComponent('Halo admin pastipremium.store, saya butuh bantuan.')}`
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#FAFAFA', // Light off-white base
      fontFamily: "'Inter', sans-serif",
      color: '#1A1A1A', // Charcoal text
      position: 'relative',
      maxWidth: '100vw',
      overflowX: 'hidden',
    }}>
      <PromoPopup />

      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid #E5E5E5',
        padding: '0 24px',
        height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: '1200px', margin: '0 auto',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontSize: '1.2rem', fontWeight: 900, color: '#005ac2',
            letterSpacing: '-0.03em',
          }}>
            AURA
          </div>
        </div>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/reseller/login"
            style={{
              fontSize: '0.8rem', fontWeight: 600,
              color: '#666', padding: '6px 10px',
              textDecoration: 'none', transition: 'color 0.2s',
            }}
          >Mitra</Link>

          {buyer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Link
                href="/buyer/lookup"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#F0F4F8', border: '1px solid #E2E8F0',
                  borderRadius: '6px', padding: '6px 12px',
                  fontSize: '0.8rem', fontWeight: 600, color: '#1A1A1A',
                  textDecoration: 'none',
                }}
              >
                📦 Pesanan Saya
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  fontSize: '0.8rem', fontWeight: 600,
                  color: '#EF4444', padding: '6px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >Keluar</button>
            </div>
          ) : (
            <Link
              href="/buyer/login"
              style={{
                background: '#005ac2', color: '#fff',
                padding: '8px 18px', borderRadius: '4px',
                fontSize: '0.8rem', fontWeight: 600,
                textDecoration: 'none', transition: 'background 0.2s',
                boxShadow: '0 2px 8px rgba(0, 90, 194, 0.2)',
              }}
            >Login</Link>
          )}
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section
        ref={heroRef}
        style={{
          padding: '80px 24px',
          maxWidth: '1200px', margin: '0 auto',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          maxWidth: '800px',
        }}>
          <h1 style={{
            fontSize: 'clamp(3rem, 8vw, 5rem)',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            color: '#111',
            margin: '0 0 24px 0',
          }}>
            Elevate Your <br />
            Digital Space.
          </h1>
          <p style={{
            fontSize: '1.1rem', color: '#666',
            lineHeight: 1.6, marginBottom: '40px',
            maxWidth: '500px',
          }}>
            Discover premium, handcrafted subscription essentials for the modern home.
          </p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button
              onClick={() => {
                const el = document.getElementById('katalog');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                background: '#005ac2',
                color: '#fff', border: 'none',
                padding: '16px 36px', borderRadius: '4px',
                fontSize: '0.9rem', fontWeight: 600, letterSpacing: '1px',
                cursor: 'pointer',
                transition: 'background 0.2s',
                textTransform: 'uppercase',
              }}
            >Shop Collection</button>
          </div>
        </div>
        
        {/* Abstract Image Placeholder for Hero like in Stitch mockup */}
        <div style={{
          marginTop: '60px',
          width: '100%', maxWidth: '800px', height: '400px',
          background: '#EAEAEA',
          borderRadius: '16px', zIndex: -1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative'
        }}>
           <div style={{
             width: '100%', height: '100%',
             background: 'linear-gradient(to right, #e2e2e2, #f3f3f3)',
             backgroundImage: 'url("https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&q=80")', // Minimalist vase/decor image
             backgroundSize: 'cover',
             backgroundPosition: 'center',
             opacity: 0.9,
           }} />
        </div>
      </section>

      {/* ── LEADERBOARD (Monochrome & Sage Accent) ── */}
      {leaderboard.length > 0 && (
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 60px' }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAEAEA',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.02)',
            display: 'flex', flexDirection: 'column', gap: '20px',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              borderBottom: '1px solid #F0F0F0', paddingBottom: '16px',
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#111' }}>
                  🏅 Top Partners
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#888' }}>
                  Daily earning leaderboard.
                </p>
              </div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}>
              {leaderboard.map((entry, idx) => {
                const isFirst = entry.rank_position === 1;
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px', borderRadius: '8px',
                    background: isFirst ? '#F8FAF9' : '#F9FAFB', // Sage tint for first
                    border: isFirst ? '1px solid #E2E8E4' : '1px solid #F3F4F6',
                  }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '4px',
                      background: isFirst ? '#6B8E7B' : '#E5E7EB', // Sage green equivalent
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 800, color: isFirst ? '#FFF' : '#6B7280',
                    }}>{entry.rank_position}</div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111' }}>
                        {entry.avatar_emoji} {entry.mitra_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10B981' }}>
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

      {/* ── TRENDING PRODUCTS / KATALOG ── */}
      <section id="katalog" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 80px' }}>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#888', fontSize: '0.9rem' }}>
            Waking up the database...
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#888' }}>
            No products found.
          </div>
        ) : !selectedCategory ? (
          <>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111', marginBottom: '24px' }}>
              Collection
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '24px',
            }}>
              {categories.map(category => {
                const count = products.filter(p => p.platform_name.toUpperCase() === category).length;
                return (
                  <div
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    style={{
                      background: '#FFF',
                      padding: '32px 24px',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
                      transition: 'transform 0.2s, background 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F5F5F5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#FFF';
                    }}
                  >
                    <div style={{
                      fontSize: '3rem', marginBottom: '8px',
                    }}>{getPlatformEmoji(category)}</div>
                    
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontWeight: 600, fontSize: '1.2rem', color: '#111',
                        marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px'
                      }}>{category}</div>
                      <div style={{
                        fontSize: '0.8rem', color: '#888',
                      }}>{count} Options Available</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              marginBottom: '40px',
            }}>
              <button
                onClick={() => setSelectedCategory(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '8px 0',
                  cursor: 'pointer', color: '#888',
                  fontSize: '0.85rem', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '1px'
                }}
              >← Back</button>
            </div>

            <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 32px 0', color: '#111' }}>
               {selectedCategory}
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '32px'
            }}>
              {products.filter(p => p.platform_name.toUpperCase() === selectedCategory).map(product => {
                const promo = promos.find(pr => {
                  const now = new Date();
                  return pr.product_id === product.id &&
                    new Date(pr.start_date) <= now &&
                    new Date(pr.end_date) >= now;
                });

                return (
                  <div
                    key={product.id}
                    style={{
                      display: 'flex', flexDirection: 'column',
                    }}
                  >
                    {/* Placeholder image representation for products */}
                    <div style={{
                      width: '100%', height: '220px', background: '#F5F5F5',
                      marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '3rem'
                    }}>
                      {getPlatformEmoji(product.platform_name)}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                      <h3 style={{
                        fontSize: '1rem', fontWeight: 600, color: '#111',
                        margin: 0,
                      }}>{product.name}</h3>
                      
                      <div style={{ textAlign: 'right' }}>
                        {promo ? (
                          <>
                            <span style={{ fontSize: '0.85rem', color: '#005ac2', fontWeight: 600 }}>
                              {formatPrice(promo.promo_price)}
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.85rem', color: '#111', fontWeight: 600 }}>
                            {formatPrice(product.price)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      marginBottom: '16px',
                    }}>
                      <span style={{
                        color: '#666',
                        fontSize: '0.75rem', fontWeight: 400,
                      }}>{product.duration_days} Days / {product.account_type}</span>
                    </div>

                    <div style={{ marginTop: 'auto' }}>
                      <Link
                        href={`/order/${product.id}`}
                        style={{
                          display: 'block', width: '100%', textAlign: 'center',
                          background: 'transparent', color: '#005ac2',
                          border: '1px solid #005ac2',
                          padding: '12px 16px', fontSize: '0.85rem', fontWeight: 600,
                          textDecoration: 'none', transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#005ac2';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#005ac2';
                        }}
                      >Add to Cart</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        background: '#FFF',
        padding: '60px 24px',
        textAlign: 'center',
        marginTop: '40px',
      }}>
        <div style={{
          fontSize: '1.2rem', fontWeight: 900, color: '#111',
          letterSpacing: '-0.03em', marginBottom: '16px',
        }}>
          AURA.
        </div>
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '32px' }}>
             <a href="#" style={{ color: '#111', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Shop</a>
             <a href="#" style={{ color: '#111', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>About</a>
             <a href="#" style={{ color: '#111', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>Contact</a>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#888', margin: 0 }}>
          Crafted with Intention. © 2026.
        </p>
      </footer>
    </div>
  );
}
