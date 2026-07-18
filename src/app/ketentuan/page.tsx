'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';
import { FiAlertCircle, FiShield, FiFileText, FiInfo, FiCheckCircle, FiXCircle, FiRefreshCw, FiArrowRight, FiChevronDown, FiStar } from 'react-icons/fi';

export default function KetentuanPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  // Warranty Checker States
  const [checkerPlatform, setCheckerPlatform] = useState('');
  const [checkerIssue, setCheckerIssue] = useState('');

  useEffect(() => {
    async function loadProducts() {
      try {
        const { data } = await supabase
          .from('products')
          .select('*')
          .not('terms', 'is', null)
          .order('platform_name', { ascending: true });
        
        const filtered = (data || []).filter(p => p.terms && p.terms.trim() !== '');
        setProducts(filtered);
        if (filtered.length > 0) {
          const firstCat = filtered[0].platform_name || 'Lainnya';
          setSelectedCategory(firstCat);
          setSelectedProduct(filtered[0]);
        }
      } catch (err) {
        console.error('Error loading products terms:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  const categories = Array.from(new Set(products.map(p => p.platform_name || 'Lainnya'))).sort();
  const productsInCategory = products.filter(p => (p.platform_name || 'Lainnya') === selectedCategory);

  return (
    <div className="terms-page" style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, #fff7ed 0, #fbfbfd 34%, #f8fafc 100%)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: '#1d1d1f',
    }}>
      {/* Header */}
      <header className="terms-header" style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        padding: '0 16px',
        height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{
          fontWeight: 600, fontSize: '1.05rem',
          letterSpacing: '-0.01em', color: '#1d1d1f',
          textDecoration: 'none',
        }}>
          PastiPremium
        </Link>
        <Link href="/" style={{
          fontSize: '0.85rem', fontWeight: 500,
          color: '#0071e3', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          ← Kembali ke Beranda
        </Link>
      </header>

      {/* Page Content */}
      <main className="terms-main" style={{ maxWidth: '860px', margin: '0 auto', padding: '56px 24px 88px' }}>

        {/* Page Title */}
        <div className="terms-hero" style={{ marginBottom: '36px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '64px', height: '64px', borderRadius: '20px',
            background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
            color: 'white', fontSize: '2rem', marginBottom: '20px',
            boxShadow: '0 8px 24px rgba(238,90,36,0.3)',
          }}>
            <FiAlertCircle size={32} />
          </div>
          <h1 style={{
            fontSize: '2.2rem', fontWeight: 700,
            letterSpacing: '-0.03em', marginBottom: '12px',
            color: '#1d1d1f',
          }}>
            Ketentuan & Garansi
          </h1>
          <p style={{ fontSize: '1rem', color: '#86868b', fontWeight: 400, maxWidth: '500px', margin: '0 auto' }}>
            Kebijakan penting yang perlu Anda ketahui sebelum menggunakan layanan premium kami.
          </p>
          <div className="terms-hero-tags" style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '20px' }}>
            {['Garansi transparan', 'Aturan per produk', 'Bantuan klaim'].map((label) => (
              <span key={label} style={{
                padding: '7px 11px', borderRadius: '999px', background: 'rgba(255,255,255,0.78)',
                border: '1px solid rgba(0,0,0,0.07)', color: '#555', fontSize: '0.76rem', fontWeight: 650,
              }}>{label}</span>
            ))}
          </div>
        </div>

        {/* Greeting Card */}
        <div className="terms-intro-card" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(239,246,255,0.84))',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,0,0,0.05)',
          borderRadius: '20px', padding: '22px 24px', marginBottom: '32px',
          boxShadow: '0 10px 28px rgba(37,99,235,0.06)'
        }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <div style={{ color: '#0071e3', marginTop: '2px' }}><FiInfo size={24} /></div>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.6, margin: 0, color: '#1d1d1f' }}>
              Terima kasih telah memilih kami! Harga super hemat yang Anda dapatkan adalah hasil dari pemanfaatan promo trial resmi secara legal. Mohon baca dengan teliti kebijakan garansi di bawah demi kenyamanan bersama.
            </p>
          </div>
        </div>

        {/* Section - Garansi */}
        <section style={{ marginBottom: '32px' }}>
          <div className="terms-card" style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
              }}>
                <FiShield size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                Cakupan Garansi
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* Guaranteed */}
              <div style={{
                background: 'rgba(16,185,129,0.04)',
                border: '1px solid rgba(16,185,129,0.15)',
                borderRadius: '16px', padding: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <FiCheckCircle size={18} color="#10b981" />
                  <span style={{
                    color: '#059669', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase'
                  }}>Tercover</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: '#1d1d1f', lineHeight: 1.6, margin: 0 }}>
                  <strong>Akun expired normal</strong> (habis masa trial) sebelum waktunya. Kami akan mengganti dengan akun baru secara gratis.
                </p>
              </div>

              {/* NOT Guaranteed */}
              <div style={{
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: '16px', padding: '20px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <FiXCircle size={18} color="#ef4444" />
                  <span style={{
                    color: '#dc2626', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase'
                  }}>Tidak Tercover</span>
                </div>
                <p style={{ fontSize: '0.9rem', color: '#1d1d1f', lineHeight: 1.6, margin: 0 }}>
                  <strong>Akun dibanned / terblokir</strong> oleh sistem deteksi platform resmi. Ini merupakan kebijakan sepihak platform di luar kendali kami.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Warranty Checker */}
        <section style={{ marginBottom: '32px' }}>
          <div className="terms-card" style={{
            background: 'linear-gradient(145deg, #ffffff, #fcfcfd)',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #0071e3, #0056b3)',
                color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, boxShadow: '0 4px 12px rgba(0,113,227,0.3)',
              }}>
                <FiRefreshCw size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                Cek Status Garansi Instan
              </h2>
            </div>
            
            <p style={{ fontSize: '0.9rem', color: '#86868b', marginBottom: '20px' }}>
              Pilih masalah yang Anda alami untuk mengetahui apakah Anda berhak mengklaim garansi penggantian akun.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div style={{ position: 'relative' }}>
                <select 
                  value={checkerPlatform} 
                  onChange={(e) => setCheckerPlatform(e.target.value)}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: '12px',
                    border: '1px solid rgba(0,0,0,0.1)', background: '#fff',
                    fontSize: '0.95rem', color: '#1d1d1f', appearance: 'none',
                    outline: 'none', cursor: 'pointer', fontFamily: 'inherit'
                  }}
                >
                  <option value="">Pilih Platform / Aplikasi...</option>
                  <option value="streaming">Netflix / Spotify / YouTube / Prime</option>
                  <option value="design">Canva / Figma / Adobe</option>
                  <option value="productivity">ChatGPT / Claude / Zoom / Grammarly</option>
                  <option value="other">Aplikasi Lainnya</option>
                </select>
                <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#86868b' }}>
                  <FiChevronDown />
                </div>
              </div>

              {checkerPlatform && (
                <div style={{ position: 'relative', animation: 'fadeIn 0.3s ease' }}>
                  <select 
                    value={checkerIssue} 
                    onChange={(e) => setCheckerIssue(e.target.value)}
                    style={{
                      width: '100%', padding: '14px 16px', borderRadius: '12px',
                      border: '1px solid rgba(0,0,0,0.1)', background: '#fff',
                      fontSize: '0.95rem', color: '#1d1d1f', appearance: 'none',
                      outline: 'none', cursor: 'pointer', fontFamily: 'inherit'
                    }}
                  >
                    <option value="">Apa kendala yang Anda alami?</option>
                    <option value="expired">Tiba-tiba kembali ke versi Gratis / Expired sebelum waktunya</option>
                    <option value="banned">Akun terblokir / Tidak bisa login (Banned / Incorrect Password)</option>
                    <option value="screen">Screen limit / Terlalu banyak device (Khusus Akun Sharing)</option>
                  </select>
                  <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#86868b' }}>
                    <FiChevronDown />
                  </div>
                </div>
              )}
            </div>

            {/* Checker Result */}
            {checkerPlatform && checkerIssue && (
              <div style={{
                background: checkerIssue === 'expired' ? 'rgba(16,185,129,0.08)' : (checkerIssue === 'screen' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'),
                border: checkerIssue === 'expired' ? '1px solid rgba(16,185,129,0.2)' : (checkerIssue === 'screen' ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(239,68,68,0.2)'),
                borderRadius: '16px', padding: '20px', animation: 'fadeIn 0.4s ease'
              }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ marginTop: '2px' }}>
                    {checkerIssue === 'expired' ? <FiCheckCircle color="#10b981" size={20} /> : (checkerIssue === 'screen' ? <FiAlertCircle color="#f59e0b" size={20} /> : <FiXCircle color="#ef4444" size={20} />)}
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 600, color: checkerIssue === 'expired' ? '#059669' : (checkerIssue === 'screen' ? '#b45309' : '#dc2626') }}>
                      {checkerIssue === 'expired' ? 'Garansi Tersedia!' : (checkerIssue === 'screen' ? 'Solusi Mandiri' : 'Tidak Tercover Garansi')}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#3d3d3d', lineHeight: 1.5 }}>
                      {checkerIssue === 'expired' ? 'Kendala ini 100% tercover garansi kami. Silakan klik tombol "Klaim Garansi" di bagian bawah halaman ini untuk mendapatkan akun pengganti.' : 
                       (checkerIssue === 'screen' ? 'Untuk akun sharing, wajar jika terjadi screen limit. Silakan tunggu beberapa saat atau coba lagi nanti. Tidak perlu ganti akun.' : 
                       'Maaf, kebijakan platform yang memblokir akun berada di luar kendali kami. Kendala ini tidak termasuk dalam cakupan garansi.')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section - Kebijakan Kelangsungan Layanan */}
        <section style={{ marginBottom: '32px' }}>
          <div className="terms-card" style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '24px',
            padding: '32px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
              }}>
                <FiFileText size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                Kelangsungan Layanan
              </h2>
            </div>
            <p style={{ fontSize: '0.95rem', color: '#3d3d3d', lineHeight: 1.7, margin: 0 }}>
              Setelah event promo resmi berakhir, kami tidak menjamin akun akan aktif selamanya karena aturan keamanan platform yang terus diperbarui. Namun, jika aplikasi tidak bisa digunakan (di luar banned/blokir), kami selalu siap membantu Anda <strong>beralih ke platform alternatif sejenis</strong> yang lebih stabil dengan mudah dan cepat. Pembelian ini bersifat final dan Anda menyetujui seluruh ketentuan ini saat melakukan pembayaran.
            </p>
          </div>
        </section>

        {/* Section - Product-specific Terms (Interactive) */}
        {!loading && products.length > 0 && (
          <section style={{ marginBottom: '40px' }}>
            <div className="terms-card product-terms-card" style={{
              background: '#ffffff',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: '24px',
              padding: '32px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, boxShadow: '0 4px 12px rgba(217,119,6,0.3)',
                }}>
                  <FiStar size={20} />
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                  Ketentuan Khusus Produk
                </h2>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#86868b', lineHeight: 1.5, marginBottom: '24px' }}>
                Setiap aplikasi memiliki aturan penggunaan yang berbeda (khususnya akun sharing). Ikuti panduan berikut agar garansi Anda tetap valid.
              </p>

              {/* Category Tabs */}
              <div style={{ position: 'relative' }}>
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  overflowX: 'auto',
                  paddingBottom: '16px',
                  marginBottom: '16px',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch',
                }}>
                  {categories.map(cat => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedCategory(cat);
                          const firstInCat = products.find(p => (p.platform_name || 'Lainnya') === cat);
                          setSelectedProduct(firstInCat || null);
                        }}
                        style={{
                          background: isSelected ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#ffffff',
                          border: isSelected ? '1px solid transparent' : '1px solid rgba(0,0,0,0.08)',
                          boxShadow: isSelected ? '0 4px 12px rgba(217,119,6,0.25)' : '0 2px 4px rgba(0,0,0,0.02)',
                          borderRadius: '12px',
                          padding: '12px 20px',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: isSelected ? '#ffffff' : '#3d3d3d',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
                {/* Fade out edge for scroll indication */}
                <div style={{
                  position: 'absolute', right: 0, top: 0, bottom: '16px', width: '40px',
                  background: 'linear-gradient(to right, transparent, #ffffff)', pointerEvents: 'none'
                }} />
              </div>

              {/* Product Sub-options */}
              {productsInCategory.length > 1 && (
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginBottom: '20px',
                  padding: '12px',
                  background: 'rgba(0,0,0,0.02)',
                  borderRadius: '16px',
                }}>
                  {productsInCategory.map(p => {
                    const isSelected = selectedProduct?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        style={{
                          background: isSelected ? 'linear-gradient(135deg, #6c5ce7, #5b43d6)' : '#ffffff',
                          border: isSelected ? '1px solid transparent' : '1px solid rgba(0,0,0,0.08)',
                          boxShadow: isSelected ? '0 2px 8px rgba(108,92,231,0.2)' : 'none',
                          borderRadius: '8px',
                          padding: '8px 16px',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          color: isSelected ? '#ffffff' : '#3d3d3d',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Display terms detail of selected product */}
              {selectedProduct && (
                <div style={{
                  background: 'rgba(108, 92, 231, 0.03)',
                  border: '1px solid rgba(108, 92, 231, 0.15)',
                  borderRadius: '16px',
                  padding: '24px',
                  animation: 'fadeIn 0.3s ease',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FiFileText color="#6c5ce7" /> Aturan Pemakaian {selectedProduct.name}
                    </span>
                    <span style={{
                      background: selectedProduct.account_type === 'sharing' ? 'rgba(59,130,246,0.1)' : 'rgba(108,92,231,0.1)',
                      color: selectedProduct.account_type === 'sharing' ? '#3b82f6' : '#6c5ce7',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Tipe: {selectedProduct.account_type}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: '9px' }}>
                    {(selectedProduct.terms || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => (
                      <div key={`${line}-${index}`} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '11px 12px',
                        borderRadius: '10px', background: 'rgba(255,255,255,0.75)', color: '#3d3d3d',
                        fontSize: '0.88rem', lineHeight: 1.55,
                      }}>
                        <span style={{ color: '#6c5ce7', fontWeight: 800, lineHeight: 1.4 }}>•</span>
                        <span>{line.replace(/^[-•\d.\s]+/, '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Summary Box */}
        <div className="terms-summary" style={{
          background: 'linear-gradient(135deg, #1d1d1f, #2d2d2f)',
          borderRadius: '24px', padding: '36px',
          marginBottom: '40px', color: '#fff',
          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
        }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '24px', color: '#f5f5f7', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiCheckCircle /> Ringkasan Ketentuan
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { icon: <FiCheckCircle color="#10b981" />, text: 'Garansi ganti akun baru jika expired normal (trial habis)' },
              { icon: <FiXCircle color="#ef4444" />, text: 'Tidak ada garansi jika akun di-ban/blokir oleh platform' },
              { icon: <FiInfo color="#3b82f6" />, text: 'Harga murah karena memanfaatkan promo trial resmi platform' },
              { icon: <FiRefreshCw color="#a855f7" />, text: 'Siap alihkan ke platform alternatif jika layanan tidak bisa digunakan (non-ban)' },
              { icon: <FiAlertCircle color="#f59e0b" />, text: 'Pembelian bersifat final — tidak ada refund di luar ketentuan garansi' },
            ].map(({ icon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: '2px' }}>{icon}</span>
                <span style={{ fontSize: '0.9rem', lineHeight: 1.6, color: '#d1d1d6' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="terms-cta" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.95rem', color: '#86868b', marginBottom: '24px' }}>
            Punya pertanyaan lain? Tim CS kami siap membantu Anda.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: '#0071e3', color: '#fff',
              padding: '16px 32px', borderRadius: '30px',
              fontSize: '0.95rem', fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(0,113,227,0.3)',
              transition: 'transform 0.2s',
            }}>
              Lihat Katalog Produk
            </Link>
            <Link href="/warranty" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: '#ffffff', color: '#1d1d1f',
              border: '1px solid rgba(0,0,0,0.1)',
              padding: '16px 32px', borderRadius: '30px',
              fontSize: '0.95rem', fontWeight: 600,
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              transition: 'transform 0.2s',
            }}>
              Klaim Garansi <FiArrowRight />
            </Link>
          </div>
        </div>

        {/* Footer note */}
        <div style={{
          marginTop: '64px', paddingTop: '32px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '0.85rem', color: '#86868b', margin: 0 }}>
            Salam hangat, <strong>Tim pastipremium.my.id</strong> ✨
          </p>
          <p style={{ fontSize: '0.75rem', color: '#aeaeb2', marginTop: '8px' }}>
            Halaman ini terakhir diperbarui: {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </main>
      <style jsx>{`
        .terms-page :global(button), .terms-page :global(a) { -webkit-tap-highlight-color: transparent; }
        .terms-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .terms-card:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07) !important; }
        .terms-cta :global(a) { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .terms-cta :global(a):hover { transform: translateY(-2px); }
        @media (max-width: 640px) {
          .terms-header { height: 52px !important; }
          .terms-main { padding: 36px 16px 64px !important; }
          .terms-hero { text-align: left !important; margin-bottom: 28px !important; }
          .terms-hero > div:first-child { margin-bottom: 16px !important; }
          .terms-hero h1 { font-size: 1.85rem !important; }
          .terms-hero p { margin-left: 0 !important; }
          .terms-hero-tags { justify-content: flex-start !important; }
          .terms-intro-card, .terms-card, .terms-summary { padding: 20px !important; border-radius: 18px !important; }
          .product-terms-card { padding: 20px !important; }
          .terms-cta :global(a) { width: 100%; justify-content: center; padding: 14px 20px !important; }
        }
      `}</style>
    </div>
  );
}
