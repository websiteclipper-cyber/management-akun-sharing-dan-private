'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FiAlertCircle, FiArrowLeft, FiCheck, FiCheckCircle, FiClock, FiCreditCard, FiUser, FiX } from 'react-icons/fi';
import styles from './refund.module.css';

type EwalletProvider = '' | 'dana' | 'gopay';

interface RefundSuccess {
  request_code: string;
  estimated_days: string;
}

const PROVIDERS: Array<{ id: Exclude<EwalletProvider, ''>; name: string; color: string; shortName: string }> = [
  { id: 'dana', name: 'DANA', color: '#118eea', shortName: 'D' },
  { id: 'gopay', name: 'GoPay', color: '#00aa5b', shortName: 'G' },
];

export default function RefundPage() {
  return (
    <Suspense fallback={<div className={styles.loadingPage}><div className="loading-spinner" /></div>}>
      <RefundForm />
    </Suspense>
  );
}

function RefundForm() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<RefundSuccess | null>(null);
  const [formData, setFormData] = useState({
    order_number: searchParams.get('order') || searchParams.get('order_number') || '',
    ewallet_provider: '' as EwalletProvider,
    ewallet_number: '',
    account_holder_name: '',
  });

  useEffect(() => {
    if (!success) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSuccess(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [success]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const ewalletNumber = formData.ewallet_number.replace(/\D/g, '');
    if (!formData.ewallet_provider) {
      setError('Pilih tujuan refund DANA atau GoPay.');
      return;
    }
    if (ewalletNumber.length < 9 || ewalletNumber.length > 15) {
      setError('Nomor e-wallet harus terdiri dari 9–15 digit.');
      return;
    }
    if (formData.account_holder_name.trim().length < 2) {
      setError('Masukkan nama pemilik akun e-wallet.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          order_number: formData.order_number.trim().toUpperCase(),
          ewallet_number: ewalletNumber,
          account_holder_name: formData.account_holder_name.trim(),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Pengajuan refund belum dapat dikirim.');
        return;
      }

      setSuccess({
        request_code: result.request_code,
        estimated_days: result.estimated_days || '3–7 hari',
      });
    } catch {
      setError('Gagal terhubung ke server. Periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  }

  const selectedProvider = PROVIDERS.find((provider) => provider.id === formData.ewallet_provider);

  return (
    <div className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          <FiArrowLeft aria-hidden="true" /> Kembali
        </Link>
      </header>

      <main className={styles.main}>
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className={styles.card}
        >
          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}><FiCreditCard aria-hidden="true" /></div>
            <span className={styles.eyebrow}>Pengembalian dana</span>
            <h1>Ajukan Refund</h1>
            <p>Isi data pesanan dan pilih e-wallet tujuan pengembalian dana.</p>
          </div>

          <div className={styles.distinctionNote}>
            <FiAlertCircle aria-hidden="true" />
            <div>
              <strong>Refund berbeda dari klaim garansi</strong>
              <span>Form ini khusus untuk pengembalian dana. Kendala akun tetap diajukan melalui menu Klaim Garansi.</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            {error && (
              <div className={styles.error} role="alert">
                <FiAlertCircle aria-hidden="true" /> <span>{error}</span>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="refund-order">ID Pesanan</label>
              <input
                id="refund-order"
                type="text"
                required
                autoComplete="off"
                placeholder="Contoh: ORD-20260726-A1B2C3D4"
                value={formData.order_number}
                onChange={(event) => setFormData((current) => ({
                  ...current,
                  order_number: event.target.value.toUpperCase().replace(/\s+/g, ''),
                }))}
              />
              <small>Gunakan ID yang tercantum pada invoice atau riwayat pesanan.</small>
            </div>

            <fieldset className={styles.providerFieldset}>
              <legend>Refund ke e-wallet</legend>
              <div className={styles.providerGrid}>
                {PROVIDERS.map((provider) => {
                  const isSelected = formData.ewallet_provider === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className={`${styles.providerButton} ${isSelected ? styles.providerSelected : ''}`}
                      aria-pressed={isSelected}
                      onClick={() => setFormData((current) => ({
                        ...current,
                        ewallet_provider: provider.id,
                        ewallet_number: '',
                      }))}
                    >
                      <span className={styles.providerLogo} style={{ background: provider.color }}>{provider.shortName}</span>
                      <span>{provider.name}</span>
                      <span className={styles.providerCheck}>{isSelected && <FiCheck aria-hidden="true" />}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <AnimatePresence initial={false}>
              {selectedProvider && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className={styles.dynamicFields}
                >
                  <div className={styles.field}>
                    <label htmlFor="refund-ewallet-number">Nomor {selectedProvider.name}</label>
                    <div className={styles.inputWithIcon}>
                      <FiCreditCard aria-hidden="true" />
                      <input
                        id="refund-ewallet-number"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        required
                        minLength={9}
                        maxLength={15}
                        placeholder="Contoh: 081234567890"
                        value={formData.ewallet_number}
                        onChange={(event) => setFormData((current) => ({
                          ...current,
                          ewallet_number: event.target.value.replace(/\D/g, '').slice(0, 15),
                        }))}
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="refund-account-name">Atas Nama</label>
                    <div className={styles.inputWithIcon}>
                      <FiUser aria-hidden="true" />
                      <input
                        id="refund-account-name"
                        type="text"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={100}
                        placeholder="Nama pemilik akun e-wallet"
                        value={formData.account_holder_name}
                        onChange={(event) => setFormData((current) => ({
                          ...current,
                          account_holder_name: event.target.value.slice(0, 100),
                        }))}
                      />
                    </div>
                    <small>Pastikan nama dan nomor sesuai agar dana tidak salah kirim.</small>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={styles.timelineNote}>
              <FiClock aria-hidden="true" />
              <span>Estimasi pengiriman dana setelah pengajuan disetujui: <strong>3–7 hari</strong>.</span>
            </div>

            <button type="submit" className={styles.submitButton} disabled={loading}>
              {loading ? <span className={styles.buttonSpinner} aria-hidden="true" /> : <FiCheckCircle aria-hidden="true" />}
              {loading ? 'Mengirim pengajuan...' : 'Konfirmasi Refund'}
            </button>
          </form>
        </motion.section>
      </main>
      <AnimatePresence>
        {success && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
          >
            <motion.div
              className={styles.modal}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="refund-success-title"
            >
              <button type="button" className={styles.modalClose} onClick={() => setSuccess(null)} aria-label="Tutup popup">
                <FiX aria-hidden="true" />
              </button>
              <div className={styles.successIcon}><FiCheck aria-hidden="true" /></div>
              <span className={styles.successEyebrow}>Pengajuan berhasil</span>
              <h2 id="refund-success-title">Refund sedang diproses</h2>
              <p>Dana refund akan dikirim dalam <strong>{success.estimated_days}</strong> setelah pengajuan.</p>
              <div className={styles.requestCode}>
                <span>Kode Pengajuan</span>
                <strong>{success.request_code}</strong>
              </div>
              <p className={styles.saveNote}>Simpan kode ini sebagai referensi saat menghubungi admin.</p>
              <Link href="/" className={styles.modalAction}>Kembali ke Beranda</Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
