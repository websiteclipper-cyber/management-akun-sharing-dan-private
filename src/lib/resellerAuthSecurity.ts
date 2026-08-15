import { supabaseAdmin } from '@/lib/supabase';

interface RequestRateEntry {
  count: number;
  resetAt: number;
}

const RESELLER_AUTH_QUERY_TIMEOUT_MS = 8_000;
const REQUEST_RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_LOCAL_RATE_ENTRIES = 5_000;
const MISSING_LOGIN_ATTEMPTS_ERROR_CODES = new Set(['42P01', 'PGRST205']);

const globalRateLimit = globalThis as typeof globalThis & {
  resellerLoginRateLimit?: Map<string, RequestRateEntry>;
};

const requestRateLimit =
  globalRateLimit.resellerLoginRateLimit || new Map<string, RequestRateEntry>();

globalRateLimit.resellerLoginRateLimit = requestRateLimit;

export function createResellerAuthAbortSignal(): AbortSignal {
  return AbortSignal.timeout(RESELLER_AUTH_QUERY_TIMEOUT_MS);
}

export function isResellerLoginAttemptsUnavailable(
  error: { code?: string } | null | undefined,
): boolean {
  return Boolean(error?.code && MISSING_LOGIN_ATTEMPTS_ERROR_CODES.has(error.code));
}

export function normalizeResellerRefCode(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32)
    : '';
}

export function getResellerClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return (
    forwardedFor?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-vercel-forwarded-for')?.trim() ||
    'unknown'
  ).slice(0, 128);
}

export function checkResellerRequestRateLimit(ip: string): {
  limited: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();

  if (requestRateLimit.size >= MAX_LOCAL_RATE_ENTRIES) {
    for (const [key, entry] of requestRateLimit) {
      if (entry.resetAt <= now) requestRateLimit.delete(key);
    }
  }

  const existing = requestRateLimit.get(ip);
  if (!existing || existing.resetAt <= now) {
    if (!existing && requestRateLimit.size >= MAX_LOCAL_RATE_ENTRIES) {
      return { limited: true, retryAfterSeconds: 60 };
    }

    requestRateLimit.set(ip, {
      count: 1,
      resetAt: now + REQUEST_RATE_WINDOW_MS,
    });
    return { limited: false, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  return {
    limited: existing.count > MAX_REQUESTS_PER_WINDOW,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export async function recordResellerLoginFailure(
  refCode: string,
  ip: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('reseller_login_attempts')
    .insert({ ref_code: refCode, ip_address: ip })
    .abortSignal(createResellerAuthAbortSignal());

  if (isResellerLoginAttemptsUnavailable(error)) return;
  if (error) throw new Error('Unable to record reseller login failure.');
}

export async function clearResellerLoginFailures(
  refCode: string,
  ip: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('reseller_login_attempts')
    .delete()
    .eq('ref_code', refCode)
    .eq('ip_address', ip)
    .abortSignal(createResellerAuthAbortSignal());

  if (isResellerLoginAttemptsUnavailable(error)) return;
  if (error) throw new Error('Unable to clear reseller login failures.');
}

export async function cleanupResellerLoginFailures(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from('reseller_login_attempts')
    .delete()
    .lt('attempted_at', cutoff)
    .abortSignal(createResellerAuthAbortSignal());

  if (isResellerLoginAttemptsUnavailable(error)) return;
  if (error) throw new Error('Unable to clean reseller login failures.');
}
