'use client';

import { useEffect, useState } from 'react';
import { FiBookOpen } from 'react-icons/fi';
import { CREDENTIAL_TUTORIAL_DEFAULTS } from '@/lib/credential-tutorial';
import ProductTermsMarkdown from './ProductTermsMarkdown';
import styles from './BuyerUsageTutorial.module.css';

export function UsageTutorialContent({ title, content }: { title: string; content: string }) {
  if (!content.trim()) return null;

  return (
    <section className={styles.card} aria-label={title.trim() || CREDENTIAL_TUTORIAL_DEFAULTS.credential_tutorial_title}>
      <h4 className={styles.title}>
        <FiBookOpen aria-hidden="true" />
        <span>{title.trim() || CREDENTIAL_TUTORIAL_DEFAULTS.credential_tutorial_title}</span>
      </h4>
      <ProductTermsMarkdown content={content} className={styles.content} />
    </section>
  );
}

export default function BuyerUsageTutorial() {
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTutorial() {
      try {
        const response = await fetch('/api/public/settings', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to load usage tutorial');
        const data = await response.json();
        if (!controller.signal.aborted) {
          setSettings({ ...CREDENTIAL_TUTORIAL_DEFAULTS, ...data });
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }

    void loadTutorial();
    return () => controller.abort();
  }, [attempt]);

  if (error) {
    return (
      <div className={styles.notice} role="status">
        <span>Tutorial pemakaian belum dapat dimuat.</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
          setError(false);
          setAttempt(current => current + 1);
        }}>
          Coba lagi
        </button>
      </div>
    );
  }

  if (!settings) {
    return <div className={styles.notice} role="status">Memuat tutorial pemakaian...</div>;
  }

  if (settings.credential_tutorial_enabled !== 'true') return null;

  return (
    <UsageTutorialContent
      title={settings.credential_tutorial_title}
      content={settings.credential_tutorial_content}
    />
  );
}
