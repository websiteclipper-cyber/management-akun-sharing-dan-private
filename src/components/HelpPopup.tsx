'use client';

import { useEffect } from 'react';
import { FiArrowUpRight, FiMessageCircle, FiUsers, FiX } from 'react-icons/fi';
import { useLocale } from '@/lib/locale-context';
import styles from './HelpPopup.module.css';

interface HelpPopupProps {
  open: boolean;
  loading: boolean;
  whatsappUrl: string | null;
  groupUrl: string | null;
  onClose: () => void;
}

export default function HelpPopup({
  open,
  loading,
  whatsappUrl,
  groupUrl,
  onClose,
}: HelpPopupProps) {
  const { t } = useLocale();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <section
        className={styles.popup}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-popup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('help_close')}
        >
          <FiX aria-hidden="true" />
        </button>

        <div className={styles.headingIcon} aria-hidden="true">
          <FiMessageCircle />
        </div>
        <h2 id="help-popup-title" className={styles.title}>{t('help_popup_title')}</h2>
        <p className={styles.description}>{t('help_popup_desc')}</p>

        {loading && <p className={styles.loading}>{t('help_loading')}</p>}

        <div className={styles.options}>
          {whatsappUrl && (
            <a
              className={`${styles.option} ${styles.adminOption}`}
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
            >
              <span className={styles.optionIcon} aria-hidden="true"><FiMessageCircle /></span>
              <span className={styles.optionCopy}>
                <strong>{t('help_chat_admin')}</strong>
                <small>{t('help_chat_admin_desc')}</small>
              </span>
              <FiArrowUpRight className={styles.arrow} aria-hidden="true" />
            </a>
          )}

          {groupUrl && (
            <a
              className={`${styles.option} ${styles.groupOption}`}
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
            >
              <span className={styles.optionIcon} aria-hidden="true"><FiUsers /></span>
              <span className={styles.optionCopy}>
                <strong>{t('help_join_group')}</strong>
                <small>{t('help_join_group_desc')}</small>
              </span>
              <FiArrowUpRight className={styles.arrow} aria-hidden="true" />
            </a>
          )}
        </div>

        {!loading && !whatsappUrl && !groupUrl && (
          <p className={styles.unavailable}>{t('help_unavailable')}</p>
        )}
      </section>
    </div>
  );
}
