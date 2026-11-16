import { isIP } from 'node:net';

function clean(value: string | null, maxLength: number): string | null {
  const text = value?.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, maxLength);
  return text || null;
}

export function getAdminClientIp(request: Request): string | null {
  // Only trust platform-overwritten headers in production. On another host,
  // configure a trusted proxy before adding its headers here.
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL !== '1') return null;
  const value = process.env.VERCEL === '1'
    ? request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    : request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  const ip = value?.split(',')[0]?.trim() || '';
  if (!isIP(ip)) return null;
  return ip.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '');
}

function decodedHeader(request: Request, header: string): string | null {
  const value = request.headers.get(header);
  if (!value) return null;
  try {
    return clean(decodeURIComponent(value), 128);
  } catch {
    return null;
  }
}

export function getAdminLoginMetadata(request: Request) {
  const userAgent = clean(request.headers.get('user-agent'), 512);
  const ua = userAgent || '';
  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const mobile = /Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua);
  const deviceType = tablet ? 'tablet' : mobile ? 'mobile' : /Windows|Macintosh|Linux|CrOS/i.test(ua) ? 'desktop' : 'unknown';

  const browsers: Array<[RegExp, string]> = [
    [/(?:EdgA|EdgiOS|Edg)\/([\d.]+)/, 'Edge'],
    [/(?:OPR|OPiOS)\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ];
  let browser = 'Tidak diketahui';
  for (const [pattern, name] of browsers) {
    const match = ua.match(pattern);
    if (match) { browser = `${name} ${match[1].slice(0, 24)}`; break; }
  }

  let os = 'Tidak diketahui';
  if (/Windows Phone/i.test(ua)) os = 'Windows Phone';
  else if (/Windows NT 10\.0/.test(ua)) os = 'Windows 10 / 11';
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = `iOS ${ua.match(/(?:CPU(?: iPhone)? OS|iPhone OS) ([\d_]+)/)?.[1]?.replace(/_/g, '.') || ''}`.trim();
  else if (/Android/.test(ua)) os = `Android ${ua.match(/Android ([\d.]+)/)?.[1] || ''}`.trim();
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Macintosh/.test(ua)) os = `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') || ''}`.trim();
  else if (/Linux/.test(ua)) os = 'Linux';

  // No fallback to locale cookies or a default country: those are not location
  // evidence. Using Vercel metadata also avoids disclosing IPs to a geolocation API.
  const country = process.env.VERCEL === '1' ? request.headers.get('x-vercel-ip-country')?.toUpperCase() : null;
  const countryCode = country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null;
  const city = process.env.VERCEL === '1' ? decodedHeader(request, 'x-vercel-ip-city') : null;
  const region = process.env.VERCEL === '1' ? decodedHeader(request, 'x-vercel-ip-country-region') : null;

  return {
    ip_address: getAdminClientIp(request),
    user_agent: userAgent,
    device_type: deviceType,
    browser,
    os: os.slice(0, 80),
    country_code: countryCode,
    region,
    city,
    location_source: countryCode || city || region ? 'vercel' : 'unavailable',
  };
}
