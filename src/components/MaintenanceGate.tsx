'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { normalizeWhatsAppGroupLink, normalizeWhatsAppPhone } from '@/lib/phone';
import styles from './MaintenanceGate.module.css';

type GateStatus = 'checking' | 'open' | 'maintenance';

interface PublicSettings {
  maintenance_mode?: string;
  maintenance_whatsapp_group?: string;
  support_whatsapp?: string;
}

const DEFAULT_SUPPORT_WHATSAPP = '082244046330';

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith('/admin');
  const [status, setStatus] = useState<GateStatus>('checking');
  const [supportWhatsapp, setSupportWhatsapp] = useState(DEFAULT_SUPPORT_WHATSAPP);
  const [maintenanceGroupLink, setMaintenanceGroupLink] = useState('');

  useEffect(() => {
    if (isAdminRoute) return;

    const controller = new AbortController();

    async function checkMaintenanceMode() {
      try {
        const response = await fetch('/api/public/settings', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('Tidak dapat memuat status website');

        const settings = await response.json() as PublicSettings;
        setSupportWhatsapp(settings.support_whatsapp || DEFAULT_SUPPORT_WHATSAPP);
        setMaintenanceGroupLink(settings.maintenance_whatsapp_group || '');
        setStatus(settings.maintenance_mode === 'true' ? 'maintenance' : 'open');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Fail open so a temporary settings error never locks visitors out.
        setStatus('open');
      }
    }

    void checkMaintenanceMode();
    return () => controller.abort();
  }, [isAdminRoute]);

  if (isAdminRoute || status === 'open') return <>{children}</>;

  if (status === 'checking') {
    return (
      <main className={styles.loadingPage} aria-live="polite" aria-busy="true">
        <div className={styles.loadingBrand}><span>✦</span> pastipremium.my.id</div>
        <div className={styles.spinner} aria-hidden="true" />
        <p>Memeriksa status layanan...</p>
      </main>
    );
  }

  const phone = normalizeWhatsAppPhone(supportWhatsapp)
    || normalizeWhatsAppPhone(DEFAULT_SUPPORT_WHATSAPP);
  const message = 'Halo Admin pastipremium.my.id, saya ingin menanyakan informasi terkait maintenance website.';
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const whatsappGroupUrl = normalizeWhatsAppGroupLink(maintenanceGroupLink);

  return (
    <main className={styles.page}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbOne}`} aria-hidden="true" />
      <div className={`${styles.orb} ${styles.orbTwo}`} aria-hidden="true" />

      <section className={styles.card} aria-labelledby="maintenance-title">
        <div className={styles.brand}><span>✦</span> pastipremium.my.id</div>

        <div className={styles.iconWrap} aria-hidden="true">
          <span className={styles.icon}>🛠️</span>
        </div>

        <div className={styles.badge}>
          <span className={styles.badgeDot} aria-hidden="true" />
          Pemeliharaan sedang berlangsung
        </div>

        <h1 id="maintenance-title">Website Sedang Dalam Pemeliharaan</h1>
        <p className={styles.description}>
          Kami sedang melakukan peningkatan agar layanan menjadi lebih baik.
          Silakan coba kembali beberapa saat lagi.
        </p>

        <div className={styles.infoBox}>
          <span className={styles.infoIcon} aria-hidden="true">i</span>
          <p>Butuh bantuan sekarang? Admin kami tetap dapat dihubungi melalui WhatsApp.</p>
        </div>

        <div className={styles.actions}>
          <a
            className={styles.whatsappButton}
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span aria-hidden="true">💬</span>
            Chat WhatsApp Admin
          </a>

          {whatsappGroupUrl && (
            <a
              className={styles.groupButton}
              href={whatsappGroupUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span aria-hidden="true">👥</span>
              Gabung Grup WhatsApp
            </a>
          )}
        </div>

        <p className={styles.contact}>Nomor bantuan: +{phone}</p>
        <p className={styles.footer}>Terima kasih atas pengertian Anda.</p>
      </section>
    </main>
  );
}
