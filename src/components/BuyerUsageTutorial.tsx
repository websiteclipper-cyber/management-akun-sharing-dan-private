'use client';

import { FiBookOpen } from 'react-icons/fi';
import {
  DEFAULT_CREDENTIAL_TUTORIAL_TITLE,
  getProductCredentialTutorial,
  type ProductCredentialTutorial,
} from '@/lib/credential-tutorial';
import ProductTermsMarkdown from './ProductTermsMarkdown';
import styles from './BuyerUsageTutorial.module.css';

export function UsageTutorialContent({ title, content }: { title: string; content: string }) {
  if (!content.trim()) return null;

  return (
    <section className={styles.card} aria-label={title.trim() || DEFAULT_CREDENTIAL_TUTORIAL_TITLE}>
      <h4 className={styles.title}>
        <FiBookOpen aria-hidden="true" />
        <span>{title.trim() || DEFAULT_CREDENTIAL_TUTORIAL_TITLE}</span>
      </h4>
      <ProductTermsMarkdown content={content} className={styles.content} />
    </section>
  );
}

export default function BuyerUsageTutorial({ product }: { product?: ProductCredentialTutorial | null }) {
  const tutorial = getProductCredentialTutorial(product);
  return tutorial ? <UsageTutorialContent title={tutorial.title} content={tutorial.content} /> : null;
}
