import crypto from 'crypto';
import { isIP } from 'net';
import { normalizeWhatsAppPhone } from '@/lib/phone';
import { supabaseAdmin } from '@/lib/supabase';

export type BuyerBanIdentifierType = 'email' | 'phone' | 'ip';

export interface BuyerBanIdentifier {
  type: BuyerBanIdentifierType;
  hash: string;
}

function getBanHashSecret(): string {
  const secret = process.env.BUYER_BAN_HASH_SECRET
    || process.env.JWT_SECRET
    || process.env.ENCRYPTION_KEY;

  if (!secret || secret.length < 32) {
    throw new Error('Buyer ban hashing secret must be at least 32 characters.');
  }

  return secret;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let ip = value.trim().toLowerCase();
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

export function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0];
  return normalizeIp(forwarded || request.headers.get('x-real-ip'));
}

function hashIdentifier(type: BuyerBanIdentifierType, normalizedValue: string): string {
  return crypto
    .createHmac('sha256', getBanHashSecret())
    .update(`${type}:${normalizedValue}`)
    .digest('hex');
}

export function buildBuyerBanIdentifiers(input: {
  email?: unknown;
  phone?: unknown;
  ips?: unknown[];
}): BuyerBanIdentifier[] {
  const values: Array<[BuyerBanIdentifierType, string | null]> = [
    ['email', normalizeEmail(input.email)],
    ['phone', normalizeWhatsAppPhone(input.phone)],
    ...(input.ips || []).map((ip): [BuyerBanIdentifierType, string | null] => ['ip', normalizeIp(ip)]),
  ];
  const unique = new Map<string, BuyerBanIdentifier>();

  for (const [type, value] of values) {
    if (!value) continue;
    const hash = hashIdentifier(type, value);
    unique.set(`${type}:${hash}`, { type, hash });
  }

  return Array.from(unique.values());
}

export async function isBuyerIdentityBanned(input: {
  request: Request;
  email?: unknown;
  phone?: unknown;
}): Promise<boolean> {
  const identifiers = buildBuyerBanIdentifiers({
    email: input.email,
    phone: input.phone,
    ips: [getRequestIp(input.request)],
  });
  if (identifiers.length === 0) return false;

  const { data, error } = await supabaseAdmin
    .from('buyer_ban_identifiers')
    .select('id')
    .in('identifier_hash', identifiers.map((identifier) => identifier.hash))
    .limit(1);

  if (error) throw new Error('Failed to check buyer ban identifiers.');
  return Boolean(data?.length);
}

export async function recordBannedBuyerRequestIp(
  buyerId: number,
  request: Request,
): Promise<void> {
  const identifier = buildBuyerBanIdentifiers({ ips: [getRequestIp(request)] })[0];
  if (!identifier) return;

  const { error } = await supabaseAdmin
    .from('buyer_ban_identifiers')
    .upsert({
      buyer_id: buyerId,
      identifier_type: identifier.type,
      identifier_hash: identifier.hash,
    }, {
      onConflict: 'buyer_id,identifier_type,identifier_hash',
      ignoreDuplicates: true,
    });

  if (error) console.error('Failed to record blocked buyer IP:', error.message);
}

