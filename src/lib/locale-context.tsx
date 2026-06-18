'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { translate } from './translations';
import { fetchExchangeRates, convertFromIDR, formatCurrency } from './currency';
import { SUPPORTED_LOCALES } from './country-mapping';

interface LocaleContextType {
  locale: string;
  currency: string;
  setLocale: (locale: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatPrice: (amountIDR: number) => string;
  formatPriceIDR: (amountIDR: number) => string;
  isIDR: boolean;
  supportedLocales: typeof SUPPORTED_LOCALES;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'id',
  currency: 'IDR',
  setLocale: () => {},
  t: (key) => key,
  formatPrice: (amount) => `Rp ${amount.toLocaleString()}`,
  formatPriceIDR: (amount) => `Rp ${amount.toLocaleString()}`,
  isIDR: true,
  supportedLocales: SUPPORTED_LOCALES,
});

export function useLocale() {
  return useContext(LocaleContext);
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

interface Props {
  children: ReactNode;
  initialLocale?: string;
  initialCurrency?: string;
}

export function LocaleProvider({ children, initialLocale, initialCurrency }: Props) {
  const [locale, setLocaleState] = useState(initialLocale || 'id');
  const [currency, setCurrency] = useState(initialCurrency || 'IDR');
  const [rates, setRates] = useState<Record<string, number>>({});

  // Read from cookies on mount (client-side)
  useEffect(() => {
    const cookieLocale = getCookie('pp_locale');
    const cookieCurrency = getCookie('pp_currency');
    if (cookieLocale) setLocaleState(cookieLocale);
    if (cookieCurrency) setCurrency(cookieCurrency);
  }, []);

  // Fetch exchange rates if not IDR
  useEffect(() => {
    if (currency !== 'IDR') {
      fetchExchangeRates().then((data) => {
        if (data?.rates) setRates(data.rates);
      });
    }
  }, [currency]);

  const setLocale = useCallback((newLocale: string) => {
    setLocaleState(newLocale);
    setCookie('pp_locale', newLocale);

    // Find the default currency for this locale
    const localeInfo = SUPPORTED_LOCALES.find(l => l.code === newLocale);
    if (localeInfo) {
      // Map locale to a default currency
      const localeCurrencyMap: Record<string, string> = {
        id: 'IDR', en: 'USD', ms: 'MYR', th: 'THB',
        vi: 'VND', ar: 'SAR', zh: 'CNY', ja: 'JPY', ko: 'KRW',
      };
      const newCurrency = localeCurrencyMap[newLocale] || 'USD';
      setCurrency(newCurrency);
      setCookie('pp_currency', newCurrency);
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return translate(locale, key, params);
  }, [locale]);

  const formatPrice = useCallback((amountIDR: number) => {
    if (currency === 'IDR') {
      return formatCurrency(amountIDR, 'IDR', locale);
    }
    const converted = convertFromIDR(amountIDR, currency, rates);
    return formatCurrency(converted, currency, locale);
  }, [currency, locale, rates]);

  const formatPriceIDR = useCallback((amountIDR: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amountIDR);
  }, []);

  return (
    <LocaleContext.Provider value={{
      locale,
      currency,
      setLocale,
      t,
      formatPrice,
      formatPriceIDR,
      isIDR: currency === 'IDR',
      supportedLocales: SUPPORTED_LOCALES,
    }}>
      {children}
    </LocaleContext.Provider>
  );
}
