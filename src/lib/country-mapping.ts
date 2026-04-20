// Country code (ISO 3166-1 alpha-2) → locale + currency mapping

export interface CountryConfig {
  locale: string;
  currency: string;
  flag: string;
  langName: string;
}

export const COUNTRY_MAP: Record<string, CountryConfig> = {
  // Southeast Asia
  ID: { locale: 'id', currency: 'IDR', flag: '🇮🇩', langName: 'Indonesia' },
  MY: { locale: 'ms', currency: 'MYR', flag: '🇲🇾', langName: 'Malay' },
  SG: { locale: 'en', currency: 'SGD', flag: '🇸🇬', langName: 'English' },
  TH: { locale: 'th', currency: 'THB', flag: '🇹🇭', langName: 'ไทย' },
  VN: { locale: 'vi', currency: 'VND', flag: '🇻🇳', langName: 'Tiếng Việt' },
  PH: { locale: 'en', currency: 'PHP', flag: '🇵🇭', langName: 'English' },
  BN: { locale: 'ms', currency: 'BND', flag: '🇧🇳', langName: 'Malay' },

  // East Asia
  JP: { locale: 'ja', currency: 'JPY', flag: '🇯🇵', langName: '日本語' },
  KR: { locale: 'ko', currency: 'KRW', flag: '🇰🇷', langName: '한국어' },
  CN: { locale: 'zh', currency: 'CNY', flag: '🇨🇳', langName: '中文' },
  TW: { locale: 'zh', currency: 'TWD', flag: '🇹🇼', langName: '中文' },
  HK: { locale: 'zh', currency: 'HKD', flag: '🇭🇰', langName: '中文' },

  // South Asia
  IN: { locale: 'en', currency: 'INR', flag: '🇮🇳', langName: 'English' },
  BD: { locale: 'en', currency: 'BDT', flag: '🇧🇩', langName: 'English' },

  // Middle East
  SA: { locale: 'ar', currency: 'SAR', flag: '🇸🇦', langName: 'العربية' },
  AE: { locale: 'ar', currency: 'AED', flag: '🇦🇪', langName: 'العربية' },
  QA: { locale: 'ar', currency: 'QAR', flag: '🇶🇦', langName: 'العربية' },
  KW: { locale: 'ar', currency: 'KWD', flag: '🇰🇼', langName: 'العربية' },

  // Americas
  US: { locale: 'en', currency: 'USD', flag: '🇺🇸', langName: 'English' },
  CA: { locale: 'en', currency: 'CAD', flag: '🇨🇦', langName: 'English' },
  BR: { locale: 'en', currency: 'BRL', flag: '🇧🇷', langName: 'English' },
  MX: { locale: 'en', currency: 'MXN', flag: '🇲🇽', langName: 'English' },

  // Europe
  GB: { locale: 'en', currency: 'GBP', flag: '🇬🇧', langName: 'English' },
  DE: { locale: 'en', currency: 'EUR', flag: '🇩🇪', langName: 'English' },
  FR: { locale: 'en', currency: 'EUR', flag: '🇫🇷', langName: 'English' },
  NL: { locale: 'en', currency: 'EUR', flag: '🇳🇱', langName: 'English' },
  IT: { locale: 'en', currency: 'EUR', flag: '🇮🇹', langName: 'English' },
  ES: { locale: 'en', currency: 'EUR', flag: '🇪🇸', langName: 'English' },
  RU: { locale: 'en', currency: 'RUB', flag: '🇷🇺', langName: 'English' },
  TR: { locale: 'en', currency: 'TRY', flag: '🇹🇷', langName: 'English' },

  // Oceania
  AU: { locale: 'en', currency: 'AUD', flag: '🇦🇺', langName: 'English' },
  NZ: { locale: 'en', currency: 'NZD', flag: '🇳🇿', langName: 'English' },
};

// Supported locales for the language switcher
export const SUPPORTED_LOCALES = [
  { code: 'id', flag: '🇮🇩', name: 'Indonesia', nativeName: 'Bahasa Indonesia' },
  { code: 'en', flag: '🇺🇸', name: 'English', nativeName: 'English' },
  { code: 'ms', flag: '🇲🇾', name: 'Malay', nativeName: 'Bahasa Melayu' },
  { code: 'th', flag: '🇹🇭', name: 'Thai', nativeName: 'ภาษาไทย' },
  { code: 'vi', flag: '🇻🇳', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'ar', flag: '🇸🇦', name: 'Arabic', nativeName: 'العربية' },
  { code: 'zh', flag: '🇨🇳', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', flag: '🇯🇵', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', flag: '🇰🇷', name: 'Korean', nativeName: '한국어' },
];

export const DEFAULT_CONFIG: CountryConfig = {
  locale: 'id',
  currency: 'IDR',
  flag: '🇮🇩',
  langName: 'Indonesia',
};

export function getConfigForCountry(countryCode: string): CountryConfig {
  return COUNTRY_MAP[countryCode?.toUpperCase()] || DEFAULT_CONFIG;
}
