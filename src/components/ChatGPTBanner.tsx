'use client';

import { useState, useEffect } from 'react';
import { TbBrandOpenai } from 'react-icons/tb';

export default function ChatGPTBanner() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Small delay for smooth entrance
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  function handleClose() {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 400);
  }

  function handleAction() {
    handleClose();
    // Scroll to catalog and select ChatGPT if possible, or just scroll to catalog
    const el = document.getElementById('katalog');
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9998,
          animation: closing ? 'popupFadeOut 0.4s ease forwards' : 'popupFadeIn 0.4s ease forwards',
        }}
      />

      {/* Banner Container */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          width: '90%',
          maxWidth: '440px',
          animation: closing ? 'bannerFlyOut 0.4s ease forwards' : 'bannerFlyIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
      >
        <div style={{
          background: '#0a0a0a',
          borderRadius: '24px',
          overflow: 'hidden',
          boxShadow: '0 25px 80px rgba(16, 163, 127, 0.2), 0 0 0 1px rgba(16, 163, 127, 0.3)',
          position: 'relative',
        }}>
          {/* Decorative glow */}
          <div style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '150px',
            height: '150px',
            background: 'radial-gradient(circle, rgba(16, 163, 127, 0.4) 0%, transparent 70%)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }} />

          {/* Close Button */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              zIndex: 10,
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          >
            ✕
          </button>

          {/* Content */}
          <div style={{ padding: '40px 32px 32px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{
              width: '72px',
              height: '72px',
              background: 'linear-gradient(135deg, #10A37F 0%, #0D7A5F 100%)',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem',
              color: '#fff',
              margin: '0 auto 20px',
              boxShadow: '0 8px 24px rgba(16, 163, 127, 0.4)',
            }}>
              <TbBrandOpenai />
            </div>

            <h2 style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              color: '#fff',
              marginBottom: '8px',
              letterSpacing: '-0.02em',
            }}>
              Promo Spesial<br />
              <span style={{ color: '#10A37F' }}>ChatGPT Pro</span>
            </h2>

            <div style={{
              display: 'inline-block',
              background: 'rgba(16, 163, 127, 0.15)',
              border: '1px solid rgba(16, 163, 127, 0.3)',
              color: '#10A37F',
              padding: '6px 16px',
              borderRadius: '999px',
              fontSize: '0.85rem',
              fontWeight: 700,
              marginBottom: '24px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>
              ✅ FULL GARANSI
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '28px',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div style={{ fontSize: '0.9rem', color: '#888', marginBottom: '4px', fontWeight: 500 }}>Harga Normal</div>
              <div style={{
                fontSize: '1.2rem',
                color: '#666',
                textDecoration: 'line-through',
                textDecorationColor: '#ef4444',
                textDecorationThickness: '2px',
                marginBottom: '12px',
                fontWeight: 600,
              }}>
                Rp 5.000.000+
              </div>

              <div style={{ fontSize: '0.9rem', color: '#aaa', marginBottom: '4px', fontWeight: 600 }}>Diskon Spesial Hari Ini</div>
              <div style={{
                fontSize: '2.8rem',
                fontWeight: 900,
                color: '#fff',
                lineHeight: 1,
                textShadow: '0 4px 20px rgba(16, 163, 127, 0.4)',
              }}>
                Rp 100.000
              </div>
            </div>

            <button
              onClick={handleAction}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '16px',
                border: 'none',
                background: 'linear-gradient(135deg, #10A37F 0%, #0b614b 100%)',
                color: '#fff',
                fontSize: '1.1rem',
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '0.5px',
                transition: 'all 0.3s ease',
                boxShadow: '0 8px 24px rgba(16, 163, 127, 0.3)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(16, 163, 127, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 163, 127, 0.3)';
              }}
            >
              AMBIL PROMO SEKARANG
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes popupFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popupFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes bannerFlyIn {
          from {
            opacity: 0;
            transform: translate(-50%, -40%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes bannerFlyOut {
          from {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          to {
            opacity: 0;
            transform: translate(-50%, -60%) scale(0.95);
          }
        }
      `}</style>
    </>
  );
}
