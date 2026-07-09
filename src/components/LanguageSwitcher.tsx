'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocale } from '@/lib/locale-context';

export default function LanguageSwitcher() {
  const { locale, setLocale, supportedLocales } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = supportedLocales.find(l => l.code === locale) || supportedLocales[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: '#ffffff',
          border: '1px solid #d8e0eb',
          borderRadius: '10px',
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: '#0f172a',
          transition: 'all 0.2s',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f8fafc';
          e.currentTarget.style.borderColor = '#b6c2d2';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#ffffff';
          e.currentTarget.style.borderColor = '#d8e0eb';
        }}
      >
        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{current.flag}</span>
        <span style={{ fontSize: '0.72rem' }}>{current.code.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5 }}>
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: '#ffffff',
            borderRadius: '14px',
            boxShadow: '0 18px 44px rgba(15, 23, 42, 0.14), 0 0 0 1px #d8e0eb',
            padding: '6px',
            zIndex: 200,
            minWidth: '200px',
            animation: 'langDropIn 0.2s ease',
          }}
        >
          {supportedLocales.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLocale(lang.code);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 14px',
                border: 'none',
                background: locale === lang.code ? 'rgba(37, 99, 235, 0.10)' : 'transparent',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: locale === lang.code ? 600 : 400,
                color: locale === lang.code ? '#2563eb' : '#0f172a',
                transition: 'all 0.15s',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (locale !== lang.code) e.currentTarget.style.background = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                if (locale !== lang.code) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{lang.flag}</span>
              <div>
                <div>{lang.nativeName}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>
                  {lang.name}
                </div>
              </div>
              {locale === lang.code && (
                <span style={{ marginLeft: 'auto', color: '#2563eb', fontSize: '0.9rem' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes langDropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
