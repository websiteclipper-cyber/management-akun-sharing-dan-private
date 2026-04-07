'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface ActiveCampaign {
  id: string;
  code: string;
  discount_type: 'fixed' | 'percentage';
  discount_value: number;
  product_id: number | null;
  valid_from: string;
  valid_until: string;
  product?: {
    name: string;
    price: number;
    platform_name: string;
  };
  // We'll compute these
  original_price?: number;
  final_price?: number;
  promo_price?: number;
}

export default function PromoPopup() {
  const [campaign, setCampaign] = useState<ActiveCampaign | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Only show once per session
    const dismissed = sessionStorage.getItem('promo_popup_dismissed');
    if (dismissed) return;

    loadActiveCampaign();
  }, []);

  async function loadActiveCampaign() {
    const now = new Date().toISOString();

    // Fetch the newest active campaign that has a product_id (specific product promo)
    const { data } = await supabase
      .from('discount_campaigns')
      .select('*, product:products(name, price, platform_name)')
      .eq('is_active', true)
      .lte('valid_from', now)
      .gte('valid_until', now)
      .not('product_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data || !data.product) return;

    const product = data.product as unknown as { name: string; price: number; platform_name: string };
    const originalPrice = product.price;

    // Check for active promo (sale price) on the product
    const { data: promoData } = await supabase
      .from('promos')
      .select('promo_price')
      .eq('product_id', data.product_id)
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now)
      .maybeSingle();

    const basePrice = promoData ? Number(promoData.promo_price) : originalPrice;

    let discountAmount = 0;
    if (data.discount_type === 'percentage') {
      discountAmount = Math.round(basePrice * data.discount_value / 100);
    } else {
      discountAmount = Math.min(data.discount_value, basePrice);
    }

    const finalPrice = basePrice - discountAmount;

    setCampaign({
      ...data,
      product: product,
      original_price: basePrice,
      final_price: finalPrice,
    });

    // Small delay before showing for smooth entrance
    setTimeout(() => setVisible(true), 500);
  }

  function handleClose() {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setCampaign(null);
      sessionStorage.setItem('promo_popup_dismissed', '1');
    }, 400);
  }

  function handleCopy() {
    if (!campaign) return;
    navigator.clipboard.writeText(campaign.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatPrice(n: number) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
  }

  function getRemainingDays(): string {
    if (!campaign) return '';
    const end = new Date(campaign.valid_until);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return 'Hari terakhir!';
    if (diff === 1) return 'Berakhir besok!';
    return `${diff} hari lagi`;
  }

  if (!campaign || !visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 9998,
          animation: closing ? 'popupFadeOut 0.4s ease forwards' : 'popupFadeIn 0.4s ease forwards',
        }}
      />

      {/* Floating Ticket */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          width: '90%',
          maxWidth: '420px',
          animation: closing ? 'ticketFlyOut 0.4s ease forwards' : 'ticketFlyIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
      >
        {/* The Ticket Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 25px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
          position: 'relative',
          /* 3D perspective tilt */
          transform: 'perspective(800px) rotateY(-2deg) rotateX(1deg)',
        }}>
          {/* Close button */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.08)',
              border: 'none',
              cursor: 'pointer',
              color: '#666',
              fontSize: '1.1rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              zIndex: 2,
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.15)'; e.currentTarget.style.color = '#000'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#666'; }}
          >
            ✕
          </button>

          {/* Top Section - Dark Header */}
          <div style={{
            background: '#111',
            padding: '28px 28px 20px',
            textAlign: 'center',
            position: 'relative',
          }}>
            <div style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '3px',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '8px',
            }}>
              ✦ KODE PROMO EKSKLUSIF ✦
            </div>
            <div style={{
              fontSize: '2.2rem',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '4px',
              fontFamily: 'monospace',
              textShadow: '0 2px 20px rgba(255,255,255,0.15)',
            }}>
              {campaign.code}
            </div>
            <div style={{
              marginTop: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '999px',
              padding: '4px 14px',
              fontSize: '0.7rem',
              color: 'rgba(255,255,255,0.6)',
              fontWeight: 600,
            }}>
              ⏳ {getRemainingDays()}
            </div>
          </div>

          {/* Perforated Divider */}
          <div style={{
            position: 'relative',
            height: '24px',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {/* Left notch */}
            <div style={{
              position: 'absolute',
              left: '-12px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.7)',
            }} />
            {/* Dashed line */}
            <div style={{
              width: 'calc(100% - 56px)',
              borderTop: '2px dashed #ddd',
            }} />
            {/* Right notch */}
            <div style={{
              position: 'absolute',
              right: '-12px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.7)',
            }} />
          </div>

          {/* Bottom Section - Light Content */}
          <div style={{
            padding: '20px 28px 28px',
            textAlign: 'center',
          }}>
            {/* Product Info */}
            <div style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: '#999',
              marginBottom: '6px',
            }}>
              {campaign.product?.platform_name}
            </div>
            <div style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: '#111',
              marginBottom: '16px',
            }}>
              {campaign.product?.name}
            </div>

            {/* Price Comparison */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              marginBottom: '20px',
            }}>
              <div>
                <div style={{
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: '#aaa',
                  marginBottom: '2px',
                  fontWeight: 600,
                }}>Harga Normal</div>
                <div style={{
                  fontSize: '1.3rem',
                  fontWeight: 800,
                  color: '#bbb',
                  textDecoration: 'line-through',
                  textDecorationColor: '#e74c3c',
                  textDecorationThickness: '2px',
                }}>
                  {formatPrice(campaign.original_price || 0)}
                </div>
              </div>

              <div style={{
                fontSize: '1.5rem',
                color: '#ccc',
                fontWeight: 300,
              }}>→</div>

              <div>
                <div style={{
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: '#111',
                  marginBottom: '2px',
                  fontWeight: 700,
                }}>Dengan Kode</div>
                <div style={{
                  fontSize: '1.6rem',
                  fontWeight: 900,
                  color: '#111',
                }}>
                  {formatPrice(campaign.final_price || 0)}
                </div>
              </div>
            </div>

            {/* Savings Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#111',
              color: '#fff',
              borderRadius: '999px',
              padding: '6px 16px',
              fontSize: '0.75rem',
              fontWeight: 700,
              marginBottom: '20px',
            }}>
              💰 HEMAT {formatPrice((campaign.original_price || 0) - (campaign.final_price || 0))}
            </div>

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '2px solid #111',
                background: copied ? '#111' : '#fff',
                color: copied ? '#fff' : '#111',
                fontSize: '0.9rem',
                fontWeight: 800,
                cursor: 'pointer',
                letterSpacing: '1px',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseOver={(e) => { if (!copied) { e.currentTarget.style.background = '#111'; e.currentTarget.style.color = '#fff'; } }}
              onMouseOut={(e) => { if (!copied) { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#111'; } }}
            >
              {copied ? (
                <><span>✓</span> KODE TERCOPY!</>
              ) : (
                <><span>📋</span> SALIN KODE PROMO</>
              )}
            </button>

            <p style={{
              fontSize: '0.7rem',
              color: '#aaa',
              marginTop: '12px',
              marginBottom: 0,
            }}>
              Masukkan kode saat checkout untuk mendapatkan potongan
            </p>
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
        @keyframes ticketFlyIn {
          from {
            opacity: 0;
            transform: translate(-50%, -40%) scale(0.8) rotateX(10deg);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1) rotateX(0deg);
          }
        }
        @keyframes ticketFlyOut {
          from {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          to {
            opacity: 0;
            transform: translate(-50%, -60%) scale(0.85);
          }
        }
      `}</style>
    </>
  );
}
