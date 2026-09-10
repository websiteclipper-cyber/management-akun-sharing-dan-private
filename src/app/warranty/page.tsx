'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { FiAlertCircle, FiArrowLeft, FiCheckCircle, FiFileText, FiShield } from 'react-icons/fi';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ProductTermsMarkdown from '@/components/ProductTermsMarkdown';
import styles from '../aftersales.module.css';

interface AssignmentSummary {
  id: number;
  expired_at: string | null;
  warranty_expired_at: string | null;
  stock_account: { account_identifier?: string } | null;
}

interface OrderSummary {
  order_number: string;
  product: {
    name: string;
    terms?: string | null;
    warranty_fulfillment_type?: 'standard_replacement' | 'gemini_pro_invite';
  };
  assignments: AssignmentSummary[];
}

interface WarrantyResult {
  status: string;
  claim_code?: string;
  resolution_notes?: string;
}

const inputStyle = {
  width: '100%', padding: '12px 16px', background: '#0a0a0a', border: '1px solid #333',
  borderRadius: '8px', color: '#ededed', fontSize: '0.95rem', outline: 'none',
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#aaa', marginBottom: '8px' };

export default function WarrantyClaimPage() {
  return (
    <Suspense fallback={<div className="loading-page"><div className="loading-spinner" /></div>}>
      <WarrantyForm />
    </Suspense>
  );
}

function WarrantyForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderNumber = searchParams.get('order') || searchParams.get('order_number') || '';
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(Boolean(orderNumber));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WarrantyResult | null>(null);
  const [form, setForm] = useState({
    assignment_id: '', issue_type: 'password_changed', issue_description: '',
    gemini_invite_email: '', gemini_invite_email_confirmation: '', terms_accepted: false,
  });

  useEffect(() => {
    if (!orderNumber) return;
    const token = localStorage.getItem('buyer_token') || '';
    fetch(`/api/buyer/orders?order=${encodeURIComponent(orderNumber)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    })
      .then(async response => {
        const data = await response.json();
        if (response.status === 401) {
          router.replace(`/buyer/login?redirect=${encodeURIComponent(`/warranty?order=${orderNumber}`)}`);
          return;
        }
        if (!response.ok) throw new Error(data.error || 'Gagal memuat pesanan.');
        const selectedOrder = data.orders?.[0] as OrderSummary | undefined;
        if (!selectedOrder) throw new Error('Pesanan tidak ditemukan pada akun buyer ini.');
        if (!selectedOrder.assignments?.length) throw new Error('Pesanan belum memiliki akun aktif yang dapat diklaim.');
        setOrder(selectedOrder);
        setForm(current => ({ ...current, assignment_id: String(selectedOrder.assignments[0].id) }));
      })
      .catch(fetchError => setError(fetchError instanceof Error ? fetchError.message : 'Gagal memuat pesanan.'))
      .finally(() => setLoadingOrder(false));
  }, [orderNumber, router]);

  const isGeminiInvite = order?.product.warranty_fulfillment_type === 'gemini_pro_invite';
  const selectedAssignment = order?.assignments.find(item => String(item.id) === form.assignment_id);
  const terms = order?.product.terms?.trim() || 'Ketentuan garansi umum PastiPremium berlaku untuk pesanan ini.';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (isGeminiInvite && form.gemini_invite_email.trim().toLowerCase() !== form.gemini_invite_email_confirmation.trim().toLowerCase()) {
      setError('Konfirmasi email Google tidak sama.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/warranty/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('buyer_token') || ''}` },
        body: JSON.stringify({
          order_number: orderNumber,
          assignment_id: form.assignment_id,
          issue_type: form.issue_type,
          issue_description: form.issue_description,
          gemini_invite_email: isGeminiInvite ? form.gemini_invite_email : null,
          terms_accepted: form.terms_accepted,
        }),
      });
      const data = await response.json();
      if (response.status === 401) {
        router.push(`/buyer/login?redirect=${encodeURIComponent(`/warranty?order=${orderNumber}`)}`);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Gagal mengirim klaim.');
      setResult(data);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Gagal menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page} style={{ minHeight: '100vh', background: '#000', color: '#ededed' }}>
      <header className={styles.header} style={{ padding: '28px 40px' }}>
        <Link href="/" className={styles.brand}><span>PP</span> PastiPremium</Link>
        <Link href="/buyer/lookup" className={styles.backLink}><FiArrowLeft /> Kembali</Link>
      </header>
      <main className={styles.main} style={{ padding: '24px 20px 80px' }}>
        <div className={styles.formWrap} style={{ width: '100%', maxWidth: '680px', margin: '0 auto' }}>
          <div className={styles.card} style={{ background: '#050505', border: '1px solid #222', borderRadius: '16px', padding: '32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <FiShield style={{ fontSize: '28px', color: '#60a5fa' }} />
              <h1 style={{ fontSize: '1.6rem', margin: '12px 0 6px' }}>Klaim Garansi</h1>
              <p style={{ color: '#888', margin: 0 }}>Data akun diambil langsung dari pesanan Anda.</p>
            </div>

            {!orderNumber && <Notice error text="Buka klaim melalui tombol Ajukan Klaim Garansi pada detail pesanan Anda." />}
            {error && <Notice error text={error} />}
            {loadingOrder && <div style={{ textAlign: 'center', padding: '30px' }}><div className="loading-spinner" /></div>}

            {result ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <FiCheckCircle style={{ color: '#22c55e', fontSize: '42px' }} />
                <h2>Pengajuan Terkirim</h2>
                <p style={{ color: '#aaa', lineHeight: 1.6 }}>{result.resolution_notes}</p>
                <div style={{ background: '#111', border: '1px solid #333', padding: '12px', borderRadius: '8px' }}>
                  ID Klaim: <strong>{result.claim_code}</strong>
                </div>
              </div>
            ) : order ? (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <section style={{ background: '#0b0b0b', border: '1px solid #252525', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ color: '#777', fontSize: '0.75rem', textTransform: 'uppercase' }}>Pesanan</div>
                  <strong style={{ display: 'block', margin: '5px 0' }}>{order.product.name}</strong>
                  <span style={{ color: '#999', fontFamily: 'monospace', fontSize: '0.85rem' }}>{order.order_number}</span>
                </section>

                <div>
                  <label style={labelStyle}>Akun yang Bermasalah</label>
                  <select required style={inputStyle} value={form.assignment_id} onChange={event => setForm({ ...form, assignment_id: event.target.value })}>
                    {order.assignments.map(assignment => (
                      <option key={assignment.id} value={assignment.id}>{assignment.stock_account?.account_identifier || `Akun #${assignment.id}`}</option>
                    ))}
                  </select>
                  {selectedAssignment?.warranty_expired_at && (
                    <small style={{ color: '#888', display: 'block', marginTop: '7px' }}>
                      Batas garansi: {new Date(selectedAssignment.warranty_expired_at).toLocaleString('id-ID')}
                    </small>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Jenis Kendala</label>
                  <select style={inputStyle} value={form.issue_type} onChange={event => setForm({ ...form, issue_type: event.target.value })}>
                    <option value="password_changed">Password salah atau berubah</option>
                    <option value="suspended">Akun suspended atau hold</option>
                    <option value="expired_early">Masa aktif berakhir lebih awal</option>
                    <option value="other">Kendala lainnya</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Keterangan Kendala</label>
                  <textarea required minLength={10} maxLength={2000} style={{ ...inputStyle, minHeight: '96px', resize: 'vertical' }} value={form.issue_description} onChange={event => setForm({ ...form, issue_description: event.target.value })} placeholder="Jelaskan kendala yang terjadi..." />
                </div>

                {isGeminiInvite && (
                  <section style={{ background: 'rgba(66,133,244,0.08)', border: '1px solid rgba(66,133,244,0.35)', borderRadius: '10px', padding: '16px' }}>
                    <strong style={{ color: '#8ab4f8' }}>Akun Tujuan Aktivasi Gemini Pro</strong>
                    <p style={{ color: '#aaa', fontSize: '0.82rem', lineHeight: 1.55 }}>
                      Garansi produk ini berupa invite Gemini Pro. Masukkan akun Google milik Anda. Jangan pernah memberikan password, OTP, recovery code, atau kode 2FA.
                    </p>
                    <label style={labelStyle}>Email Google tujuan</label>
                    <input required type="email" autoComplete="email" style={inputStyle} value={form.gemini_invite_email} onChange={event => setForm({ ...form, gemini_invite_email: event.target.value })} placeholder="nama@gmail.com" />
                    <label style={{ ...labelStyle, marginTop: '14px' }}>Konfirmasi email Google</label>
                    <input required type="email" autoComplete="off" style={inputStyle} value={form.gemini_invite_email_confirmation} onChange={event => setForm({ ...form, gemini_invite_email_confirmation: event.target.value })} placeholder="Ketik ulang email" />
                  </section>
                )}

                <section style={{ background: '#0b0b0b', border: '1px solid #292929', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><FiFileText /> <strong>Ketentuan Produk</strong></div>
                  <div style={{ maxHeight: '260px', overflowY: 'auto', paddingRight: '8px' }}><ProductTermsMarkdown content={terms} /></div>
                </section>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: '#ccc', fontSize: '0.86rem', lineHeight: 1.5, cursor: 'pointer' }}>
                  <input required type="checkbox" checked={form.terms_accepted} onChange={event => setForm({ ...form, terms_accepted: event.target.checked })} style={{ marginTop: '4px' }} />
                  Saya sudah membaca dan menyetujui ketentuan garansi produk ini{isGeminiInvite ? ', termasuk pemenuhan garansi melalui invite Gemini Pro ke email Google di atas' : ''}.
                </label>

                <button type="submit" disabled={loading || !form.terms_accepted} className={styles.submitButton} style={{ padding: '13px', borderRadius: '8px', border: 0, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
                  {loading ? 'Mengirim Pengajuan...' : 'Kirim untuk Peninjauan Admin'}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div style={{ background: error ? 'rgba(239,68,68,0.1)' : '#111', border: `1px solid ${error ? 'rgba(239,68,68,0.3)' : '#333'}`, color: error ? '#f87171' : '#aaa', borderRadius: '8px', padding: '13px', marginBottom: '20px', display: 'flex', gap: '9px' }}>
      <FiAlertCircle style={{ flexShrink: 0, marginTop: '2px' }} /> {text}
    </div>
  );
}
