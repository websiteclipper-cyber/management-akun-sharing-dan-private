import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Country → locale + currency mapping (lightweight version for middleware/edge)
const COUNTRY_LOCALE: Record<string, { locale: string; currency: string }> = {
  ID: { locale: 'id', currency: 'IDR' },
  MY: { locale: 'ms', currency: 'MYR' },
  SG: { locale: 'en', currency: 'SGD' },
  TH: { locale: 'th', currency: 'THB' },
  VN: { locale: 'vi', currency: 'VND' },
  PH: { locale: 'en', currency: 'PHP' },
  BN: { locale: 'ms', currency: 'BND' },
  JP: { locale: 'ja', currency: 'JPY' },
  KR: { locale: 'ko', currency: 'KRW' },
  CN: { locale: 'zh', currency: 'CNY' },
  TW: { locale: 'zh', currency: 'TWD' },
  HK: { locale: 'zh', currency: 'HKD' },
  IN: { locale: 'en', currency: 'INR' },
  SA: { locale: 'ar', currency: 'SAR' },
  AE: { locale: 'ar', currency: 'AED' },
  QA: { locale: 'ar', currency: 'QAR' },
  KW: { locale: 'ar', currency: 'KWD' },
  US: { locale: 'en', currency: 'USD' },
  CA: { locale: 'en', currency: 'CAD' },
  GB: { locale: 'en', currency: 'GBP' },
  AU: { locale: 'en', currency: 'AUD' },
  NZ: { locale: 'en', currency: 'NZD' },
  DE: { locale: 'en', currency: 'EUR' },
  FR: { locale: 'en', currency: 'EUR' },
  NL: { locale: 'en', currency: 'EUR' },
  IT: { locale: 'en', currency: 'EUR' },
  ES: { locale: 'en', currency: 'EUR' },
  BR: { locale: 'en', currency: 'BRL' },
  MX: { locale: 'en', currency: 'MXN' },
  RU: { locale: 'en', currency: 'RUB' },
  TR: { locale: 'en', currency: 'TRY' },
};

export function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  
  // Jika diakses menggunakan domain Vercel bawaan, arahkan ke custom domain
  if (host === 'pastipremiumid1.vercel.app') {
    const url = request.nextUrl.clone();
    url.host = 'pastipremium.my.id';
    url.port = ''; // Pastikan tidak ada port
    url.protocol = 'https:'; // Pastikan menggunakan HTTPS
    
    return NextResponse.redirect(url, 301); // 301 Moved Permanently
  }

  const response = NextResponse.next();

  // ─── Auto-detect country and set locale/currency cookies ───
  // Only set cookies if they don't already exist (user hasn't manually chosen)
  const existingLocale = request.cookies.get('pp_locale')?.value;
  const existingCountry = request.cookies.get('pp_country')?.value;
  
  // Detect country code (compatible with Cloudflare, Vercel, and Netlify)
  const country = (
    request.headers.get('cf-ipcountry') || 
    (request as any).geo?.country || 
    request.headers.get('x-vercel-ip-country') || 
    'ID'
  ).toUpperCase();

  // Heal settings if user's cookies say SG but their detected location is different
  const needsFix = existingCountry === 'SG' && country !== 'SG';
  
  if (!existingLocale || needsFix) {
    const config = COUNTRY_LOCALE[country] || { locale: 'id', currency: 'IDR' };

    response.cookies.set('pp_locale', config.locale, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60, // 1 year
      sameSite: 'lax',
    });
    response.cookies.set('pp_currency', config.currency, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
    });
    response.cookies.set('pp_country', country, {
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
    });
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (exclude ALL API routes - webhooks, auth, etc must not be redirected)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - file extensions for static assets
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
