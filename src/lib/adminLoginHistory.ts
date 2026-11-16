import { supabaseAdmin } from '@/lib/supabase';
import { createAdminAuthAbortSignal } from '@/lib/adminAuthSecurity';
import { getAdminLoginMetadata } from '@/lib/adminLoginMetadata';

export type AdminLoginOutcome = 'success' | 'failed' | 'blocked';

export interface AdminLoginHistoryEntry {
  id: string;
  occurred_at: string;
  admin_id: number | null;
  admin_name: string | null;
  email: string;
  outcome: AdminLoginOutcome;
  ip_address: string | null;
  user_agent: string | null;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string;
  os: string;
  country_code: string | null;
  region: string | null;
  city: string | null;
  location_source: 'vercel' | 'unavailable';
}

export async function recordAdminLoginAttempt(
  request: Request,
  attempt: {
    email: string;
    outcome: AdminLoginOutcome;
    admin?: { id: number; name: string } | null;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from('admin_login_history').insert({
    ...getAdminLoginMetadata(request),
    admin_id: attempt.admin?.id || null,
    admin_name: attempt.admin?.name?.slice(0, 200) || null,
    email: attempt.email.slice(0, 254),
    outcome: attempt.outcome,
  }).abortSignal(createAdminAuthAbortSignal());
  if (error) throw new Error('Unable to persist admin login history.');
}

export function decodeLoginHistoryCursor(cursor: string): { at: string; id: string } | null {
  if (!cursor || cursor.length > 512) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof value?.at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.at) ||
      !Number.isFinite(Date.parse(value.at)) ||
      typeof value.id !== 'string' ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(value.id)
    ) return null;
    return { at: value.at, id: value.id };
  } catch {
    return null;
  }
}

export function encodeLoginHistoryCursor(row: Pick<AdminLoginHistoryEntry, 'id' | 'occurred_at'>): string {
  return Buffer.from(JSON.stringify({ at: row.occurred_at, id: row.id })).toString('base64url');
}
