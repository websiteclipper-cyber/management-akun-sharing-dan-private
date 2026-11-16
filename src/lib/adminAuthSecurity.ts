import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { getAdminClientIp } from '@/lib/adminLoginMetadata';

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

const ADMIN_AUTH_QUERY_TIMEOUT_MS = 10_000;
export const ADMIN_LOGIN_MAX_FAILURES = 5;
export const ADMIN_LOGIN_COOLDOWN_SECONDS = 5 * 60 * 60;

export function createAdminAuthAbortSignal(): AbortSignal {
  return AbortSignal.timeout(ADMIN_AUTH_QUERY_TIMEOUT_MS);
}

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
    ipHash: secureHash(`admin-ip:${getAdminClientIp(request) || 'unknown'}`),
  };
}

export async function checkAdminLoginCooldown(
  fingerprint: AdminAuthFingerprint,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const cooldownMs = ADMIN_LOGIN_COOLDOWN_SECONDS * 1000;
  // Keep the entire failure window preceding a still-active cooldown. Filtering
  // only the last five hours would unlock early as the first failure ages out.
  const cutoff = new Date(Date.now() - 2 * cooldownMs).toISOString();
  const signal = createAdminAuthAbortSignal();
  const recentFailures = (column: 'email_hash' | 'ip_hash', hash: string) =>
    supabaseAdmin
      .from('admin_auth_events')
      .select('attempted_at')
      .eq('event_type', 'login_failure')
      .eq(column, hash)
      .gte('attempted_at', cutoff)
      .order('attempted_at', { ascending: false })
      .limit(ADMIN_LOGIN_MAX_FAILURES)
      .abortSignal(signal);

  const [emailResult, ipResult] = await Promise.all([
    recentFailures('email_hash', fingerprint.emailHash),
    recentFailures('ip_hash', fingerprint.ipHash),
  ]);
  if (emailResult.error || ipResult.error) {
    throw new Error('Unable to verify admin login cooldown.');
  }

  const now = Date.now();
  const remainingSeconds = (attempts: { attempted_at: string }[] | null) => {
    if (!attempts || attempts.length < ADMIN_LOGIN_MAX_FAILURES) return 0;
    const latest = Date.parse(attempts[0].attempted_at);
    const earliest = Date.parse(attempts[ADMIN_LOGIN_MAX_FAILURES - 1].attempted_at);
    if (!Number.isFinite(latest) || !Number.isFinite(earliest)) {
      throw new Error('Invalid admin login failure timestamp.');
    }
    // A full failure window between these events starts fresh attempts after
    // the previous cooldown, even when its old events have not been cleaned up.
    if (latest - earliest >= cooldownMs) return 0;
    return Math.max(0, Math.ceil((latest + cooldownMs - now) / 1000));
  };
  const retryAfterSeconds = Math.max(
    remainingSeconds(emailResult.data),
    remainingSeconds(ipResult.data),
  );
  return { limited: retryAfterSeconds > 0, retryAfterSeconds };
}

export async function checkAdminAuthRateLimit(
  fingerprint: AdminAuthFingerprint,
  options: RateLimitOptions,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const cutoff = new Date(
    Date.now() - options.windowMinutes * 60 * 1000,
  ).toISOString();

  const signal = createAdminAuthAbortSignal();
  const [emailResult, ipResult] = await Promise.all([
    supabaseAdmin
      .from('admin_auth_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', options.eventType)
      .eq('email_hash', fingerprint.emailHash)
      .gte('attempted_at', cutoff)
      .abortSignal(signal),
    supabaseAdmin
      .from('admin_auth_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', options.eventType)
      .eq('ip_hash', fingerprint.ipHash)
      .gte('attempted_at', cutoff)
      .abortSignal(signal),
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
  }).abortSignal(createAdminAuthAbortSignal());

  if (error) {
    throw new Error('Unable to record admin authentication event.');
  }
}

export async function clearAdminLoginFailures(
  fingerprint: AdminAuthFingerprint,
  loginStartedAt: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('admin_auth_events')
    .delete()
    .eq('event_type', 'login_failure')
    .eq('email_hash', fingerprint.emailHash)
    // Maintenance may run after newer requests. Never erase their failures or
    // an active cooldown triggered after this successful login started.
    .lt('attempted_at', loginStartedAt)
    .abortSignal(createAdminAuthAbortSignal());

  if (error) {
    throw new Error('Unable to clear admin authentication events.');
  }
}

export async function cleanupAdminAuthEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from('admin_auth_events')
    .delete()
    .lt('attempted_at', cutoff)
    .abortSignal(createAdminAuthAbortSignal());
}
