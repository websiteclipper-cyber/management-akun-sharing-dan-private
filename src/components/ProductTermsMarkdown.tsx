'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './ProductTermsMarkdown.module.css';

interface ProductTermsMarkdownProps {
  content: string;
  className?: string;
}

export default function ProductTermsMarkdown({
  content,
  className = '',
}: ProductTermsMarkdownProps) {
  return (
    <div className={`${styles.root} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
