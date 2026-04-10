import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'change-this-secret-key';

interface AdminPayload {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface BuyerPayload {
  id: number;
  name: string;
  email: string;
  phone: string;
}

type TokenPayload = {
  type: 'admin' | 'buyer' | 'reseller';
  id: number;
  name: string;
  email: string;
  exp: number;
  iat: number;
  // Admin-specific
  role?: string;
  // Buyer-specific
  phone?: string;
  [key: string]: unknown;
};

// Simple JWT implementation using HMAC-SHA256
function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresInHours = 24): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInHours * 3600,
  } as TokenPayload;

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    // Decode payload
    const payload: TokenPayload = JSON.parse(base64UrlDecode(payloadB64));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// Helper to extract and verify admin token from request headers
export function getAdminFromRequest(request: Request): AdminPayload | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'admin') return null;

  return payload as AdminPayload;
}

// Helper to extract and verify buyer token from request headers
export function getBuyerFromRequest(request: Request): BuyerPayload | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'buyer') return null;

  return payload as BuyerPayload;
}

interface ResellerPayload {
  id: string;
  name: string;
  ref_code: string;
  phone: string;
}

// Helper to extract and verify reseller token from request headers
export function getResellerFromRequest(request: Request): ResellerPayload | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'reseller') return null;

  return payload as unknown as ResellerPayload;
}
