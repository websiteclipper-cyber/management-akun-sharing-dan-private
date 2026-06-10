'use client';

import { useState, useEffect } from 'react';
import { useLocale } from '@/lib/locale-context';
import { SiNetflix, SiSpotify, SiYoutube, SiApple, SiCanva, SiGooglegemini } from 'react-icons/si';
import { TbBrandOpenai, TbBrandDisney, TbBrandAmazon, TbRobot, TbScissors, TbPhotoVideo } from 'react-icons/tb';
import { BsStars } from 'react-icons/bs';

function getPlatformIcon(name: string) {
  const upper = name.toUpperCase();
  if (upper.includes('NETFLIX')) return <SiNetflix />;
  if (upper.includes('SPOTIFY')) return <SiSpotify />;
  if (upper.includes('YOUTUBE')) return <SiYoutube />;
  if (upper.includes('DISNEY')) return <TbBrandDisney />;
  if (upper.includes('PRIME')) return <TbBrandAmazon />;
  if (upper.includes('APPLE')) return <SiApple />;
  if (upper.includes('CANVA')) return <SiCanva />;
  if (upper.includes('CHATGPT')) return <TbBrandOpenai />;
  if (upper.includes('GEMINI')) return <SiGooglegemini />;
  if (upper.includes('GROK')) return <TbRobot />;
  if (upper.includes('CAPCUT')) return <TbScissors />;
  if (upper.includes('WINK')) return <TbPhotoVideo />;
  return <BsStars />;
}

interface GlobalPromoPopupProps {
  onSelectPlatform?: (platform: string) => void;
}

export default function GlobalPromoPopup({ onSelectPlatform }: GlobalPromoPopupProps) {
  const { formatPrice } = useLocale();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Check if user has already closed it in this session
    if (sessionStorage.getItem('global_promo_closed') === 'true') {
      return;
    }

    fetch('/api/public/settings')
      .then(r => r.json())
      .then(d => {
        setSettings(d);
        if (d.global_promo_active === 'true') {
          // Delay to make it feel natural
          setTimeout(() => setVisible(true), 1500);
        }
      })
      .catch(() => {});
  }, []);

  function handleClose() {
    setClosing(true);
    sessionStorage.setItem('global_promo_closed', 'true');
    setTimeout(() => {
      setVisible(false);
    }, 400);
  }

  function handleAction() {
    handleClose();
    if (onSelectPlatform && settings.global_promo_platform) {
      onSelectPlatform(settings.global_promo_platform);
    } else if (settings.global_promo_btn_link) {
      if (settings.global_promo_btn_link.startsWith('#')) {
        const el = document.querySelector(settings.global_promo_btn_link);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      } else {
        window.location.href = settings.global_promo_btn_link;
      }
    }
  }

  if (!visible) return null;

  const title = settings.global_promo_title || 'Promo Spesial';
  const subtitle = settings.global_promo_subtitle || 'ChatGPT Pro';
  const badge = settings.global_promo_badge || 'FULL GARANSI';
  const normalPrice = Number(settings.global_promo_normal_price || 0);
  const price = Number(settings.global_promo_price || 0);
  const btnText = settings.global_promo_btn_text || 'AMBIL PROMO SEKARANG';
  const platform = settings.global_promo_platform || 'CHATGPT';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 99998,
          animation: closing ? 'fadeOut 0.4s ease forwards' : 'fadeIn 0.4s ease forwards',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 99999,
          width: '90%',
          maxWidth: '380px',
          animation: closing ? 'scaleDown 0.4s ease forwards' : 'scaleUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div style={{
          background: '#09090b',
          borderRadius: '24px',
          padding: '32px 24px 24px',
          border: '1px solid rgba(16, 163, 127, 0.3)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(16, 163, 127, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}>
          {/* Close button */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          >
            ✕
          </button>

          {/* Icon */}
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #10A37F 0%, #0D7A5F 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            marginBottom: '20px',
            boxShadow: '0 8px 24px rgba(16, 163, 127, 0.3)',
          }}>
            {getPlatformIcon(platform)}
          </div>

          <h2 style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            color: '#fff',
            marginBottom: '4px',
          }}>
            {title}
          </h2>
          
          <h3 style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            color: '#10A37F',
            marginBottom: '16px',
          }}>
            {subtitle}
          </h3>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(16, 163, 127, 0.1)',
            border: '1px solid rgba(16, 163, 127, 0.2)',
            color: '#10A37F',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.5px',
            marginBottom: '24px',
          }}>
            ✓ {badge}
          </div>

          {/* Price Box */}
          <div style={{
            background: '#141416',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            padding: '20px',
            width: '100%',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '0.8rem', color: '#a1a1aa', marginBottom: '4px' }}>Harga Normal</div>
            <div style={{
              fontSize: '1.1rem',
              color: '#ef4444',
              textDecoration: 'line-through',
              textDecorationColor: '#ef4444',
              fontWeight: 600,
              marginBottom: '16px',
              opacity: 0.8
            }}>
              {formatPrice(normalPrice)}+
            </div>

            <div style={{ fontSize: '0.8rem', color: '#a1a1aa', marginBottom: '4px' }}>Diskon Spesial Hari Ini</div>
            <div style={{
              fontSize: '2.4rem',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '-1px',
              textShadow: '0 2px 10px rgba(255,255,255,0.1)'
            }}>
              {formatPrice(price)}
            </div>
          </div>

          <button
            onClick={handleAction}
            style={{
              width: '100%',
              background: '#10A37F',
              color: '#fff',
              border: 'none',
              padding: '16px',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 14px rgba(16, 163, 127, 0.3)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#0d8f6f';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#10A37F';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {btnText}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes scaleUp {
          from {
            opacity: 0;
            transform: translate(-50%, -40%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
        @keyframes scaleDown {
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
