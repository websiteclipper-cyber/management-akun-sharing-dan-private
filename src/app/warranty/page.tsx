'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClock, FiFileText, FiSend, FiShield } from 'react-icons/fi';
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
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span>PP</span> PastiPremium</Link>
        <Link href="/buyer/lookup" className={styles.backLink}><FiArrowLeft /> Kembali</Link>
      </header>
      <main className={styles.main}>
        <div className={styles.formWrap}>
          <div className={`${styles.card} ${styles.warrantyCard}`}>
            <div className={styles.titleBlock}>
              <div className={styles.titleIcon}><FiShield /></div>
              <span className={styles.eyebrow}>Pusat Bantuan</span>
              <h1>Klaim Garansi</h1>
              <p>Laporkan kendala akun dengan mudah. Data produk diambil langsung dari pesanan Anda.</p>
            </div>

            {!orderNumber && <Notice error text="Buka klaim melalui tombol Ajukan Klaim Garansi pada detail pesanan Anda." />}
            {error && <Notice error text={error} />}
            {loadingOrder && <div className={styles.loadingState}><div className="loading-spinner" /><span>Memuat detail pesanan...</span></div>}

            {result ? (
              <div className={styles.successState}>
                <div className={styles.successIcon}><FiCheckCircle /></div>
                <h2>Pengajuan Terkirim</h2>
                <p>{result.resolution_notes}</p>
                <div className={styles.claimCode}>
                  ID Klaim: <strong>{result.claim_code}</strong>
                </div>
              </div>
            ) : order ? (
              <form onSubmit={handleSubmit} className={styles.claimForm}>
                <section className={styles.orderSummary}>
                  <div className={styles.orderSummaryIcon}><FiShield /></div>
                  <div>
                    <div className={styles.orderLabel}>Pesanan terpilih</div>
                    <strong>{order.product.name}</strong>
                    <span className={styles.orderNumber}>{order.order_number}</span>
                  </div>
                </section>

                <div className={styles.field}>
                  <label>Akun yang Bermasalah</label>
                  <select required className={styles.input} value={form.assignment_id} onChange={event => setForm({ ...form, assignment_id: event.target.value })}>
                    {order.assignments.map(assignment => (
                      <option key={assignment.id} value={assignment.id}>{assignment.stock_account?.account_identifier || `Akun #${assignment.id}`}</option>
                    ))}
                  </select>
                  {selectedAssignment?.warranty_expired_at && (
                    <small className={styles.fieldHint}>
                      <FiClock />
                      Batas garansi: {new Date(selectedAssignment.warranty_expired_at).toLocaleString('id-ID')}
                    </small>
                  )}
                </div>

                <div className={styles.field}>
                  <label>Jenis Kendala</label>
                  <select className={styles.input} value={form.issue_type} onChange={event => setForm({ ...form, issue_type: event.target.value })}>
                    <option value="password_changed">Password salah atau berubah</option>
                    <option value="suspended">Akun suspended atau hold</option>
                    <option value="expired_early">Masa aktif berakhir lebih awal</option>
                    <option value="other">Kendala lainnya</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label>Keterangan Kendala</label>
                  <textarea required minLength={10} maxLength={2000} className={`${styles.input} ${styles.textarea}`} value={form.issue_description} onChange={event => setForm({ ...form, issue_description: event.target.value })} placeholder="Ceritakan kendala secara singkat, misalnya sejak kapan akun tidak dapat digunakan..." />
                  <small className={styles.fieldHelper}>Minimal 10 karakter agar tim kami dapat memeriksa kendala dengan tepat.</small>
                </div>

                {isGeminiInvite && (
                  <section className={styles.invitePanel}>
                    <div className={styles.sectionHeading}><FiShield /> <strong>Akun Tujuan Aktivasi Gemini Pro</strong></div>
                    <p>
                      Garansi produk ini berupa invite Gemini Pro. Masukkan akun Google milik Anda. Jangan pernah memberikan password, OTP, recovery code, atau kode 2FA.
                    </p>
                    <div className={styles.field}>
                      <label>Email Google tujuan</label>
                      <input required type="email" autoComplete="email" className={styles.input} value={form.gemini_invite_email} onChange={event => setForm({ ...form, gemini_invite_email: event.target.value })} placeholder="nama@gmail.com" />
                    </div>
                    <div className={styles.field}>
                      <label>Konfirmasi email Google</label>
                      <input required type="email" autoComplete="off" className={styles.input} value={form.gemini_invite_email_confirmation} onChange={event => setForm({ ...form, gemini_invite_email_confirmation: event.target.value })} placeholder="Ketik ulang email" />
                    </div>
                  </section>
                )}

                <section className={styles.termsPanel}>
                  <div className={styles.sectionHeading}><FiFileText /> <strong>Ketentuan Produk</strong></div>
                  <div className={styles.termsScroll}><ProductTermsMarkdown content={terms} /></div>
                </section>

                <label className={styles.consent}>
                  <input required type="checkbox" checked={form.terms_accepted} onChange={event => setForm({ ...form, terms_accepted: event.target.checked })} />
                  <span>Saya sudah membaca dan menyetujui ketentuan garansi produk ini{isGeminiInvite ? ', termasuk pemenuhan garansi melalui invite Gemini Pro ke email Google di atas' : ''}.</span>
                </label>

                <button type="submit" disabled={loading || !form.terms_accepted} className={styles.submitButton}>
                  <FiSend /> {loading ? 'Mengirim Pengajuan...' : 'Kirim untuk Peninjauan Admin'}
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
    <div className={`${styles.notice} ${error ? styles.noticeError : ''}`}>
      <FiAlertCircle /> <span>{text}</span>
    </div>
  );
}
