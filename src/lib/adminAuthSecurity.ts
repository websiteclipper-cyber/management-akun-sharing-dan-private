import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

export type AdminAuthEventType = 'login_failure' | 'password_reset_request';

export interface AdminAuthFingerprint {
  emailHash: string;
  ipHash: string;
}

interface RateLimitOptions {
  eventType: AdminAuthEventType;
  windowMinutes: number;
  maxPerEmail: number;
  maxPerIp: number;
}

export const DUMMY_ADMIN_PASSWORD_HASH =
  '$2b$12$ZdiNFAKzeHFACnOHpWQ3MuyCOf6ca6UGMdJ71zTbQqAoH/CULvRzi';

export function normalizeAdminEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function getSecuritySecret(): string {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('Admin authentication security secret is not configured.');
  }
  return secret;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const firstForwardedIp = forwardedFor?.split(',')[0]?.trim();
  return (
    firstForwardedIp ||
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-vercel-forwarded-for')?.trim() ||
    'unknown'
  ).slice(0, 128);
}

function secureHash(value: string): string {
  return crypto
    .createHmac('sha256', getSecuritySecret())
    .update(value)
    .digest('hex');
}

export function getAdminAuthFingerprint(
  request: Request,
  normalizedEmail: string,
): AdminAuthFingerprint {
  return {
    emailHash: secureHash(`admin-email:${normalizedEmail}`),
    ipHash: secureHash(`admin-ip:${getClientIp(request)}`),
  };
}

export async function checkAdminAuthRateLimit(
  fingerprint: AdminAuthFingerprint,
  options: RateLimitOptions,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const cutoff = new Date(
    Date.now() - options.windowMinutes * 60 * 1000,
  ).toISOString();

  const [emailResult, ipResult] = await Promise.all([
    supabaseAdmin
      .from('admin_auth_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', options.eventType)
      .eq('email_hash', fingerprint.emailHash)
      .gte('attempted_at', cutoff),
    supabaseAdmin
      .from('admin_auth_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', options.eventType)
      .eq('ip_hash', fingerprint.ipHash)
      .gte('attempted_at', cutoff),
  ]);

  if (emailResult.error || ipResult.error) {
    throw new Error('Unable to verify admin authentication rate limit.');
  }

  return {
    limited:
      (emailResult.count || 0) >= options.maxPerEmail ||
      (ipResult.count || 0) >= options.maxPerIp,
    retryAfterSeconds: options.windowMinutes * 60,
  };
}

export async function recordAdminAuthEvent(
  fingerprint: AdminAuthFingerprint,
  eventType: AdminAuthEventType,
): Promise<void> {
  const { error } = await supabaseAdmin.from('admin_auth_events').insert({
    event_type: eventType,
    email_hash: fingerprint.emailHash,
    ip_hash: fingerprint.ipHash,
  });

  if (error) {
    throw new Error('Unable to record admin authentication event.');
  }
}

export async function clearAdminLoginFailures(
  fingerprint: AdminAuthFingerprint,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('admin_auth_events')
    .delete()
    .eq('event_type', 'login_failure')
    .eq('email_hash', fingerprint.emailHash);

  if (error) {
    throw new Error('Unable to clear admin authentication events.');
  }
}

export async function cleanupAdminAuthEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from('admin_auth_events')
    .delete()
    .lt('attempted_at', cutoff);
}
