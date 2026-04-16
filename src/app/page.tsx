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

// Platform emoji map
const PLATFORM_EMOJI: Record<string, string> = {
  NETFLIX: '🎬', SPOTIFY: '🎵', YOUTUBE: '▶️', DISNEY: '🏰',
  VIDIO: '📺', VIU: '🎭', PRIME: '📦', APPLE: '🍎',
  CANVA: '🎨', CHATGPT: '🤖', DEFAULT: '⭐',
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
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
  }

  const categories = Array.from(new Set(products.map(p => p.platform_name.toUpperCase())));
  const waUrl = supportWa
    ? `https://wa.me/${supportWa.startsWith('0') ? '62' + supportWa.substring(1) : supportWa}?text=${encodeURIComponent('Halo admin pastipremium.store, saya butuh bantuan.')}`
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      fontFamily: "'Inter', sans-serif",
      position: 'relative',
      maxWidth: '100vw',
      overflowX: 'hidden',
    }}>
      <PromoPopup />

      {/* ── HEADER ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(9,9,11,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '0 16px',
        height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 800, color: '#fff',
          }}>✦</div>
          <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            pastipremium
          </span>
        </div>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            href="/reseller/login"
            style={{
              fontSize: '0.75rem', fontWeight: 600,
              color: 'var(--text-muted)', padding: '6px 10px',
              background: 'transparent', borderRadius: 'var(--radius-md)',
              textDecoration: 'none', transition: 'color 0.15s',
            }}
          >Mitra</Link>

          {buyer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link
                href="/buyer/lookup"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-full)', padding: '5px 12px 5px 6px',
                  fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)',
                  textDecoration: 'none',
                }}
              >
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 800, color: '#fff',
                }}>
                  📦
                </div>
                Pesanan Saya
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  fontSize: '0.75rem', fontWeight: 600,
                  color: 'var(--brand-danger)', padding: '6px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >🚪</button>
            </div>
          ) : (
            <Link
              href="/buyer/login"
              style={{
                background: 'var(--accent)', color: '#fff',
                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                fontSize: '0.78rem', fontWeight: 700,
                textDecoration: 'none', transition: 'background 0.15s',
              }}
            >Masuk</Link>
          )}
        </div>
      </header>

      {/* ── HERO ── */}
      <section
        ref={heroRef}
        style={{
          padding: '48px 20px 36px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background blobs */}
        <div style={{
          position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)',
          width: '500px', height: '500px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '20px', right: '-80px',
          width: '200px', height: '200px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 'var(--radius-full)', padding: '4px 12px',
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
          color: 'var(--accent)', marginBottom: '20px',
          textTransform: 'uppercase',
        }}>
          ⚡ Pengiriman Otomatis
        </div>

        <h1 style={{
          fontSize: 'clamp(1.9rem, 8vw, 2.6rem)',
          fontWeight: 900,
          letterSpacing: '-0.035em',
          lineHeight: 1.15,
          marginBottom: '16px',
          color: 'var(--text-primary)',
          position: 'relative',
        }}>
          Akun Premium<br />
          <span style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #06b6d4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>Harga Terbaik</span>
        </h1>

        <p style={{
          fontSize: '0.9rem', color: 'var(--text-muted)',
          lineHeight: 1.7, maxWidth: '300px',
          margin: '0 auto 28px', position: 'relative',
        }}>
          Nikmati streaming favorit tanpa batas. Akun terkirim otomatis setelah bayar.
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', position: 'relative' }}>
          <button
            onClick={() => {
              const el = document.getElementById('katalog');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              color: '#fff', border: 'none',
              padding: '12px 24px', borderRadius: 'var(--radius-md)',
              fontSize: '0.88rem', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 20px rgba(59,130,246,0.3)',
              transition: 'all 0.2s',
            }}
          >Lihat Produk →</button>
          {waUrl && (
            <a
              href={waUrl} target="_blank" rel="noopener noreferrer"
              style={{
                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-primary)',
                padding: '12px 20px', borderRadius: 'var(--radius-md)',
                fontSize: '0.88rem', fontWeight: 600,
                textDecoration: 'none', transition: 'all 0.2s',
              }}
            >💬 Tanya Dulu</a>
          )}
        </div>

        {/* Trust pills */}
        <div style={{
          display: 'flex', gap: '8px', justifyContent: 'center',
          flexWrap: 'wrap', marginTop: '24px', position: 'relative',
        }}>
          {[
            { icon: '⚡', text: 'Instant' },
            { icon: '🔒', text: 'Aman' },
            { icon: '💬', text: 'Support 24/7' },
            { icon: '✅', text: 'Terpercaya' },
          ].map(item => (
            <div key={item.text} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-full)',
              padding: '5px 12px',
              fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)',
            }}>
              <span>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── LEADERBOARD ── */}
      {leaderboard.length > 0 && (
        <section style={{ padding: '0 16px 24px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(251,191,36,0.05), rgba(245,158,11,0.02))',
            border: '1px solid rgba(251,191,36,0.15)',
            borderRadius: 'var(--radius-xl)',
            padding: '20px 16px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: '-40px', right: '-30px',
              width: '150px', height: '150px',
              background: 'radial-gradient(circle, rgba(251,191,36,0.07) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            <div style={{ marginBottom: '14px', position: 'relative' }}>
              <div style={{
                fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '1.8px', color: '#fbbf24', marginBottom: '2px',
              }}>🏆 Komisi Mitra Hari Ini</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
              {leaderboard.map((entry, idx) => {
                const isFirst = entry.rank_position === 1;
                const medalBg = entry.rank_position === 1
                  ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                  : entry.rank_position === 2
                    ? 'linear-gradient(135deg, #94a3b8, #cbd5e1)'
                    : entry.rank_position === 3
                      ? 'linear-gradient(135deg, #d97706, #b45309)'
                      : 'var(--bg-tertiary)';

                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: isFirst ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)',
                    borderRadius: 'var(--radius-md)', padding: '10px 12px',
                    transition: 'background 0.2s',
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: medalBg, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.68rem', fontWeight: 800,
                      color: entry.rank_position <= 3 ? '#fff' : 'var(--text-muted)',
                      boxShadow: isFirst ? '0 0 10px rgba(251,191,36,0.3)' : 'none',
                    }}>{entry.rank_position}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: isFirst ? 700 : 600,
                        fontSize: '0.85rem', color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {entry.avatar_emoji} {entry.mitra_name}
                      </div>
                    </div>
                    <div style={{
                      fontWeight: 800, fontSize: '0.82rem',
                      color: 'var(--brand-success)', flexShrink: 0,
                    }}>{formatPrice(entry.commission_today)}</div>
                  </div>
                );
              })}
            </div>

            <Link
              href="/reseller/register"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                marginTop: '14px',
                background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
                borderRadius: 'var(--radius-md)', padding: '10px',
                fontSize: '0.78rem', fontWeight: 700, color: '#fbbf24',
                textDecoration: 'none', transition: 'all 0.2s',
              }}
            >🚀 Gabung Mitra & Dapat Komisi</Link>
          </div>
        </section>
      )}

      {/* ── KATALOG ── */}
      <section id="katalog" style={{ padding: '0 16px 100px' }}>
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '160px', flexDirection: 'column', gap: '12px',
          }}>
            <div className="loading-spinner" />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Memuat produk...</span>
          </div>

        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📦</div>
            <h3>Belum ada produk</h3>
            <p>Produk akan segera tersedia. Stay tuned!</p>
          </div>

        ) : !selectedCategory ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '14px',
            }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                Kategori Akun
              </h2>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {categories.length} kategori
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '10px',
            }}>
              {categories.map(category => {
                const count = products.filter(p => p.platform_name.toUpperCase() === category).length;
                const emoji = getPlatformEmoji(category);
                return (
                  <div
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '18px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex', flexDirection: 'column', gap: '10px',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* Subtle top gradient */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                      background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                      borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                    }} />

                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      background: 'var(--accent-soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.4rem',
                    }}>{emoji}</div>

                    <div>
                      <div style={{
                        fontWeight: 700, fontSize: '0.9rem',
                        color: 'var(--text-primary)', marginBottom: '3px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{category}</div>
                      <div style={{
                        fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500,
                      }}>{count} paket tersedia</div>
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: '2px',
                    }}>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)',
                        letterSpacing: '0.3px',
                      }}>Lihat paket</span>
                      <span style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>→</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* Back + category title */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              marginBottom: '16px',
            }}>
              <button
                onClick={() => setSelectedCategory(null)}
                style={{
                  width: '36px', height: '36px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem', flexShrink: 0,
                }}
              >←</button>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '2px' }}>
                  {getPlatformEmoji(selectedCategory)} {selectedCategory}
                </h2>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                  {products.filter(p => p.platform_name.toUpperCase() === selectedCategory).length} paket tersedia
                </p>
              </div>
            </div>

            {/* Product cards — single column for mobile */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                      background: 'var(--bg-card)',
                      border: promo
                        ? '1px solid rgba(239,68,68,0.3)'
                        : '1px solid var(--border-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '18px',
                      boxShadow: promo ? '0 0 16px rgba(239,68,68,0.08)' : 'none',
                      position: 'relative', overflow: 'hidden',
                    }}
                  >
                    {/* Top accent bar */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                      background: promo
                        ? 'linear-gradient(90deg, #ef4444, #f97316)'
                        : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                    }} />

                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', marginBottom: '10px',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '1px', color: 'var(--accent)', marginBottom: '4px',
                        }}>{product.platform_name}</div>
                        <h3 style={{
                          fontSize: '0.95rem', fontWeight: 700,
                          color: 'var(--text-primary)', margin: 0,
                          lineHeight: 1.3,
                        }}>{product.name}</h3>
                      </div>
                      {promo && (
                        <span style={{
                          background: 'rgba(239,68,68,0.15)',
                          color: 'var(--brand-danger)',
                          border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 'var(--radius-full)',
                          padding: '3px 8px',
                          fontSize: '0.62rem', fontWeight: 800,
                          letterSpacing: '0.5px', textTransform: 'uppercase',
                          animation: 'pulse 2s infinite', flexShrink: 0, marginLeft: '8px',
                        }}>
                          {promo.promo_label}
                        </span>
                      )}
                    </div>

                    {product.description && (
                      <p style={{
                        fontSize: '0.78rem', color: 'var(--text-muted)',
                        marginBottom: '14px', lineHeight: 1.55,
                      }}>{product.description}</p>
                    )}

                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', marginBottom: '14px',
                      flexWrap: 'wrap', gap: '6px',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {promo ? (
                          <>
                            <div style={{
                              fontSize: '0.75rem', color: 'var(--text-muted)',
                              textDecoration: 'line-through', fontWeight: 500,
                            }}>{formatPrice(promo.original_price)}</div>
                            <div style={{
                              fontSize: '1.25rem', fontWeight: 900,
                              color: 'var(--brand-danger)', letterSpacing: '-0.02em',
                            }}>{formatPrice(promo.promo_price)}</div>
                          </>
                        ) : (
                          <div style={{
                            fontSize: '1.25rem', fontWeight: 900,
                            color: 'var(--text-primary)', letterSpacing: '-0.02em',
                          }}>{formatPrice(product.price)}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem', color: 'var(--text-muted)',
                          background: 'var(--bg-secondary)',
                          padding: '3px 8px', borderRadius: 'var(--radius-full)',
                        }}>{product.duration_days} hari</span>
                        <span className={`badge ${product.account_type === 'sharing' ? 'badge-info' : 'badge-primary'}`}>
                          {product.account_type}
                        </span>
                      </div>
                    </div>

                    <Link
                      href={`/order/${product.id}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                        color: '#fff', borderRadius: 'var(--radius-md)',
                        padding: '12px', fontWeight: 700, fontSize: '0.88rem',
                        textDecoration: 'none', transition: 'opacity 0.2s',
                        boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
                      }}
                    >Beli Sekarang →</Link>
                  </div>
                );
              })}
            </div>
          </>
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
            padding: '12px 16px', borderRadius: 'var(--radius-full)',
            fontWeight: 700, fontSize: '0.82rem',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(37,211,102,0.4)',
            animation: 'fadeIn 0.5s ease',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Bantuan
        </a>
      )}

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '24px 20px',
        borderTop: '1px solid var(--border-secondary)',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '6px', marginBottom: '8px',
        }}>
          <div style={{
            width: '20px', height: '20px', borderRadius: '6px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.6rem', fontWeight: 800, color: '#fff',
          }}>✦</div>
          <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>pastipremium.store</span>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
          © 2025 pastipremium.store · All rights reserved
        </p>
      </footer>

      <style>{`
        @media (min-width: 600px) {
          #katalog > div:last-child {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
