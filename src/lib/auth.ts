import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET or ENCRYPTION_KEY must be at least 32 characters.');
  }
  return secret;
}

export interface AdminPayload {
  id: number;
  name: string;
  email: string;
  role: string;
  tokenVersion: number;
}

export interface BuyerPayload {
  id: number;
  name: string;
  email: string;
  phone: string;
}

type TokenPayload = {
  type: 'admin' | 'buyer' | 'reseller' | 'admin_password_reset';
  id: number;
  name: string;
  email: string;
  exp: number;
  iat: number;
  // Admin-specific
  role?: string;
  tokenVersion?: number;
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
    .createHmac('sha256', getJwtSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;

    const header = JSON.parse(base64UrlDecode(headerB64)) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    // Verify signature
    const expectedSig = crypto
      .createHmac('sha256', getJwtSecret())
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const signatureBuffer = Buffer.from(signature, 'base64url');
    const expectedSignatureBuffer = Buffer.from(expectedSig, 'base64url');
    if (
      signatureBuffer.length !== expectedSignatureBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
    ) return null;

    // Decode payload
    const payload: TokenPayload = JSON.parse(base64UrlDecode(payloadB64));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= now
    ) return null;

    return payload;
  } catch {
    return null;
  }
}

// Helper to extract and verify admin token from request headers
export async function getAdminFromRequest(request: Request): Promise<AdminPayload | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (
    !payload ||
    payload.type !== 'admin' ||
    !Number.isInteger(payload.tokenVersion)
  ) return null;

  const { data: admin, error } = await supabaseAdmin
    .from('admins')
    .select('id, name, email, role, status, token_version')
    .eq('id', payload.id)
    .maybeSingle();

  if (
    error ||
    !admin ||
    admin.status !== 'active' ||
    String(admin.email || '').toLowerCase() !== payload.email.toLowerCase() ||
    Number(admin.token_version) !== payload.tokenVersion
  ) return null;

  return {
    id: Number(admin.id),
    name: String(admin.name || payload.name || 'Admin'),
    email: String(admin.email),
    role: String(admin.role),
    tokenVersion: Number(admin.token_version),
  };
}

export function isSuperAdmin(admin: AdminPayload | null): admin is AdminPayload {
  return admin?.role === 'super_admin';
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

export interface BuyerAccess {
  buyer: BuyerPayload;
  status: string;
}

// Re-check the database on every protected buyer request. A signed token proves
// identity, but it must not let a buyer keep access after an admin bans them.
export async function getBuyerAccessFromRequest(request: Request): Promise<BuyerAccess | null> {
  const tokenBuyer = getBuyerFromRequest(request);
  if (!tokenBuyer) return null;

  const { data: buyer, error } = await supabaseAdmin
    .from('buyers')
    .select('id, name, email, phone, status')
    .eq('id', tokenBuyer.id)
    .maybeSingle();

  if (
    error ||
    !buyer ||
    String(buyer.email || '').trim().toLowerCase() !== tokenBuyer.email.trim().toLowerCase()
  ) return null;

  return {
    buyer: {
      id: Number(buyer.id),
      name: String(buyer.name || ''),
      email: String(buyer.email || ''),
      phone: String(buyer.phone || ''),
    },
    status: String(buyer.status || ''),
  };
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
