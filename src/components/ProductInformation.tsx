import { FiChevronDown, FiFileText, FiInfo } from 'react-icons/fi';
import ProductTermsMarkdown from './ProductTermsMarkdown';
import styles from './ProductInformation.module.css';

interface ProductInformationProps {
  productName: string;
  description?: string | null;
  terms?: string | null;
  expanded?: boolean;
  id?: string;
}

export default function ProductInformation({
  productName,
  description,
  terms,
  expanded = false,
  id,
}: ProductInformationProps) {
  return (
    <section id={id} className={styles.root} aria-label={`Informasi ${productName}`}>
      <div className={styles.heading}>
        <span>TENTANG PAKET INI</span>
        <p>Kenali produk dan ketentuannya sebelum membeli.</p>
      </div>
      <details className={styles.section} open={expanded}>
        <summary>
          <FiInfo aria-hidden="true" />
          <span>Deskripsi produk</span>
          <FiChevronDown className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          {description?.trim() ? (
            <ProductTermsMarkdown content={description} />
          ) : (
            <p className={styles.empty}>Deskripsi tambahan untuk produk ini belum tersedia.</p>
          )}
        </div>
      </details>
      <details className={`${styles.section} ${styles.terms}`} open={expanded}>
        <summary>
          <FiFileText aria-hidden="true" />
          <span>Ketentuan &amp; garansi produk</span>
          <FiChevronDown className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          {terms?.trim() ? (
            <ProductTermsMarkdown content={terms} />
          ) : (
            <p className={styles.empty}>Ketentuan khusus produk ini belum dicantumkan. Hubungi admin untuk informasi garansi dan penggunaan sebelum membeli.</p>
          )}
        </div>
      </details>
    </section>
  );
}
