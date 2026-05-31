'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Product } from '@/lib/types';

export default function KetentuanPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      try {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('status', 'active')
          .not('terms', 'is', null)
          .order('platform_name', { ascending: true });
        
        const filtered = (data || []).filter(p => p.terms && p.terms.trim() !== '');
        setProducts(filtered);
        if (filtered.length > 0) {
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
  return (
    <div style={{
      minHeight: '100vh',
      background: '#fbfbfd',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
      color: '#1d1d1f',
    }}>
      {/* Header */}
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
      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Page Title */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '72px', height: '72px', borderRadius: '22px',
            background: 'linear-gradient(135deg, #ff6b6b, #ee5a24)',
            fontSize: '2rem', marginBottom: '20px',
            boxShadow: '0 8px 24px rgba(238,90,36,0.3)',
          }}>⚠️</div>
          <h1 style={{
            fontSize: '2.2rem', fontWeight: 700,
            letterSpacing: '-0.03em', marginBottom: '12px',
            color: '#1d1d1f',
          }}>
            Ketentuan & Garansi
          </h1>
          <p style={{ fontSize: '1rem', color: '#86868b', fontWeight: 400 }}>
            Catatan penting yang wajib kamu baca sebelum membeli akun premium di pastipremium.my.id
          </p>
        </div>

        {/* Greeting Card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,113,227,0.06), rgba(139,92,246,0.06))',
          border: '1px solid rgba(0,113,227,0.15)',
          borderRadius: '20px', padding: '24px', marginBottom: '28px',
        }}>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.7, margin: 0, color: '#1d1d1f' }}>
            Halo! 👋 Terima kasih sudah memilih kami untuk mendapatkan akun premium dengan harga jauh lebih murah dibanding harga resminya.
            Sebelum kamu melakukan pembelian, mohon baca halaman ini dengan teliti ya — ini demi kebaikan kita bersama.
          </p>
        </div>

        {/* Section 1 - Asal Akun */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(217,119,6,0.3)',
              }}>🎟️</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
                Asal-usul Akun Premium
              </h2>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#3d3d3d', lineHeight: 1.7, margin: 0 }}>
              Akun yang kamu beli ini <strong>diperoleh melalui promo trial resmi</strong> yang sedang berjalan — yaitu event harga murah terbatas waktu yang digelar oleh platform terkait.
              Harga super hemat yang kamu bayar adalah hasil dari pemanfaatan kesempatan promosi trial tersebut secara legal.
            </p>
          </div>
        </section>

        {/* Section 2 - Garansi */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
              }}>🛡️</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
                Garansi yang Berlaku
              </h2>
            </div>

            {/* Guaranteed */}
            <div style={{
              background: 'rgba(16,185,129,0.06)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '14px', padding: '20px', marginBottom: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{
                  background: '#10b981', color: '#fff',
                  fontSize: '0.7rem', fontWeight: 700,
                  padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.5px',
                }}>✓ TERCOVER</span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#1d1d1f', lineHeight: 1.7, margin: 0 }}>
                <strong>Akun expired secara normal</strong> (habis sesuai masa trial) → Kami akan mengganti dengan akun baru <strong>secara gratis</strong> tanpa syarat tambahan.
              </p>
            </div>

            {/* NOT Guaranteed */}
            <div style={{
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '14px', padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{
                  background: '#ef4444', color: '#fff',
                  fontSize: '0.7rem', fontWeight: 700,
                  padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.5px',
                }}>✕ TIDAK TERCOVER</span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#1d1d1f', lineHeight: 1.7, margin: 0 }}>
                <strong>Akun terblokir / dibanned oleh pihak resmi platform</strong> → Kondisi ini <strong>tidak termasuk dalam garansi</strong> kami, karena merupakan kebijakan sepihak dari platform terkait yang sepenuhnya di luar kendali kami.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3 - Kebijakan Platform */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
              }}>📋</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
                Kebijakan Kelangsungan Layanan
              </h2>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#3d3d3d', lineHeight: 1.7, margin: 0 }}>
              Setelah event / masa trial berakhir, kami <strong>tidak bisa menjamin akun tetap aktif selamanya</strong> karena hal ini sepenuhnya bergantung pada kebijakan masing-masing platform.
              <br /><br />
              Namun, jika akun tidak bisa digunakan lagi (di luar kasus terblokir), kami akan membantu kamu <strong>beralih ke aplikasi atau platform alternatif sejenis</strong> dengan cara yang paling mudah dan cepat.
            </p>
          </div>
        </section>

        {/* Section 4 - Final Sale */}
        <section style={{ marginBottom: '28px' }}>
          <div style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #0071e3, #0056b3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0,113,227,0.3)',
              }}>📌</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
                Ketentuan Pembelian
              </h2>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#3d3d3d', lineHeight: 1.7, margin: 0 }}>
              <strong>Pembelian ini bersifat final.</strong> Dengan melakukan checkout dan membayar, kamu secara otomatis menyatakan bahwa kamu telah membaca, memahami, dan <strong>menyetujui seluruh ketentuan</strong> yang tercantum di halaman ini — termasuk batasan garansi yang sudah dijelaskan di atas.
            </p>
          </div>
        </section>

        {/* Section 5 - Product-specific Terms (Interactive) */}
        {!loading && products.length > 0 && (
          <section style={{ marginBottom: '28px' }}>
            <div style={{
              background: '#ffffff',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(108,92,231,0.3)',
                }}>📋</div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: '#1d1d1f' }}>
                  Ketentuan Khusus Berdasarkan Produk
                </h2>
              </div>
              <p style={{ fontSize: '0.88rem', color: '#86868b', lineHeight: 1.5, marginBottom: '20px' }}>
                Aturan, kebijakan, dan panduan pemakaian khusus untuk masing-masing akun premium yang wajib kamu ikuti demi kelancaran garansi.
              </p>

              {/* Horizontal Tabs */}
              <div style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '12px',
                marginBottom: '20px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
              }}>
                {products.map(p => {
                  const isSelected = selectedProduct?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProduct(p)}
                      style={{
                        background: isSelected ? 'rgba(108,92,231,0.08)' : '#f5f5f7',
                        border: isSelected ? '1.5px solid #6c5ce7' : '1.5px solid transparent',
                        borderRadius: '12px',
                        padding: '10px 16px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: isSelected ? '#6c5ce7' : '#1d1d1f',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>✨</span> {p.name}
                    </button>
                  );
                })}
              </div>

              {/* Display terms detail of selected product */}
              {selectedProduct && (
                <div style={{
                  background: 'rgba(108, 92, 231, 0.03)',
                  border: '1px dashed rgba(108, 92, 231, 0.25)',
                  borderRadius: '14px',
                  padding: '20px',
                  animation: 'fadeIn 0.3s ease',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1d1d1f' }}>
                      📋 Aturan Penggunaan {selectedProduct.name}
                    </span>
                    <span style={{
                      background: selectedProduct.account_type === 'sharing' ? 'rgba(59,130,246,0.1)' : 'rgba(108,92,231,0.1)',
                      color: selectedProduct.account_type === 'sharing' ? '#3b82f6' : '#6c5ce7',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      textTransform: 'uppercase',
                    }}>
                      Tipe: {selectedProduct.account_type}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.88rem',
                    color: '#3d3d3d',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                  }}>
                    {selectedProduct.terms}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Summary Box */}
        <div style={{
          background: 'linear-gradient(135deg, #1d1d1f, #2d2d2f)',
          borderRadius: '20px', padding: '32px',
          marginBottom: '40px', color: '#fff',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px', color: '#f5f5f7' }}>
            📝 Ringkasan Ketentuan
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { icon: '✅', text: 'Garansi ganti akun baru jika expired normal (trial habis)' },
              { icon: '❌', text: 'Tidak ada garansi jika akun di-ban/blokir oleh platform' },
              { icon: '⚡', text: 'Harga murah karena memanfaatkan promo trial resmi platform' },
              { icon: '🔄', text: 'Siap alihkan ke platform alternatif jika layanan tidak bisa digunakan (non-ban)' },
              { icon: '📌', text: 'Pembelian bersifat final — tidak ada refund di luar ketentuan garansi' },
            ].map(({ icon, text }, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
                <span style={{ fontSize: '0.88rem', lineHeight: 1.6, color: '#d1d1d6' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.9rem', color: '#86868b', marginBottom: '20px' }}>
            Masih punya pertanyaan? Tim kami siap membantu kamu.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" style={{
              display: 'inline-block',
              background: '#0071e3', color: '#fff',
              padding: '14px 28px', borderRadius: '30px',
              fontSize: '0.9rem', fontWeight: 500,
              textDecoration: 'none',
            }}>
              Lihat Katalog Produk
            </Link>
            <Link href="/warranty" style={{
              display: 'inline-block',
              background: '#f2f2f2', color: '#1d1d1f',
              padding: '14px 28px', borderRadius: '30px',
              fontSize: '0.9rem', fontWeight: 500,
              textDecoration: 'none',
            }}>
              Klaim Garansi
            </Link>
          </div>
        </div>

        {/* Footer note */}
        <div style={{
          marginTop: '48px', paddingTop: '24px',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '0.8rem', color: '#86868b', margin: 0 }}>
            Salam hangat, <strong>Tim pastipremium.my.id</strong> ✨
          </p>
          <p style={{ fontSize: '0.75rem', color: '#aeaeb2', marginTop: '6px' }}>
            Halaman ini terakhir diperbarui: Mei 2025
          </p>
        </div>
      </main>
    </div>
  );
}
