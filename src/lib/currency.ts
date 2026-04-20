// Currency conversion and formatting utilities

const RATES_CACHE_KEY = 'pp_exchange_rates';
const RATES_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export interface ExchangeRates {
  base: string; // "IDR"
  rates: Record<string, number>; // e.g. { USD: 0.0000625, MYR: 0.000273, ... }
  fetchedAt: number;
}

/**
 * Fetch latest exchange rates from our API (server caches from open.er-api.com)
 */
export async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  // Check localStorage cache first
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(RATES_CACHE_KEY);
    if (cached) {
      try {
        const parsed: ExchangeRates = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < RATES_CACHE_TTL) {
          return parsed;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  try {
    const res = await fetch('/api/public/exchange-rates');
    if (!res.ok) return null;
    const data = await res.json();
    const result: ExchangeRates = {
      base: 'IDR',
      rates: data.rates || {},
      fetchedAt: Date.now(),
    };

    // Cache to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(result));
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Convert IDR amount to target currency
 */
export function convertFromIDR(amountIDR: number, targetCurrency: string, rates: Record<string, number>): number {
  if (targetCurrency === 'IDR') return amountIDR;
  const rate = rates[targetCurrency];
  if (!rate) return amountIDR; // Fallback to IDR if rate not available
  return amountIDR * rate;
}

/**
 * Format a price in the given currency and locale
 */
export function formatCurrency(amount: number, currencyCode: string, locale: string): string {
  // Map locale codes to Intl-compatible locale strings
  const localeMap: Record<string, string> = {
    id: 'id-ID',
    en: 'en-US',
    ms: 'ms-MY',
    th: 'th-TH',
    vi: 'vi-VN',
    ar: 'ar-SA',
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
  };

  const intlLocale = localeMap[locale] || 'en-US';

  // Determine fraction digits based on currency
  const noDecimalCurrencies = ['IDR', 'JPY', 'KRW', 'VND', 'TWD'];
  const minimumFractionDigits = noDecimalCurrencies.includes(currencyCode) ? 0 : 2;
  const maximumFractionDigits = noDecimalCurrencies.includes(currencyCode) ? 0 : 2;

  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    // Fallback for unsupported currencies
    return `${currencyCode} ${amount.toFixed(minimumFractionDigits)}`;
  }
}
