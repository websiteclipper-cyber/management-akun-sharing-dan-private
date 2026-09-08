'use client';

import { useState } from 'react';
import { FiAlertCircle, FiCheck, FiCopy, FiEye, FiEyeOff } from 'react-icons/fi';
import { useLocale } from '@/lib/locale-context';
import styles from './BuyerCredentialField.module.css';

interface BuyerCredentialFieldProps {
  assignmentId: number;
  label: string;
  credentialType?: 'password' | 'two_factor';
}

export default function BuyerCredentialField({
  assignmentId,
  label,
  credentialType = 'password',
}: BuyerCredentialFieldProps) {
  const { t } = useLocale();
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function reveal() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/buyer/decrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('buyer_token') || ''}`,
        },
        body: JSON.stringify({ assignmentId, credentialType }),
      });
      const data = await response.json();

      if (!response.ok || typeof data.decrypted !== 'string' || !data.decrypted) {
        throw new Error(
          response.status === 401
            ? t('cred_session_expired')
            : t('cred_reveal_error'),
        );
      }

      setValue(data.decrypted);
      setRevealed(true);
    } catch (revealError) {
      setValue('');
      setRevealed(false);
      setError(revealError instanceof Error ? revealError.message : t('cred_reveal_error'));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!value) return;

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.field}>
      <div className={styles.content}>
        <div className={styles.label}>{label}</div>
        <div className={styles.value} aria-live="polite">
          {revealed ? value : '••••••••••'}
        </div>
        {error && (
          <div className={styles.error} role="alert">
            <FiAlertCircle aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {revealed ? (
          <>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => setRevealed(false)}
              aria-label={t('cred_hide')}
              title={t('cred_hide')}
            >
              <FiEyeOff aria-hidden="true" />
              <span>{t('cred_hide')}</span>
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${copied ? styles.copied : ''}`}
              onClick={() => void copy()}
              aria-label={copied ? t('cred_copied') : t('cred_copy')}
            >
              {copied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
              <span>{copied ? t('cred_copied_text') : t('cred_copy_text')}</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${styles.actionButton} ${styles.revealButton}`}
            onClick={() => void reveal()}
            disabled={loading}
            aria-label={t('cred_reveal_text')}
            title={t('cred_reveal_text')}
          >
            <FiEye aria-hidden="true" />
            <span>{loading ? t('cred_loading') : t('cred_reveal_text')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
