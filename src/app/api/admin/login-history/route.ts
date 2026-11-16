import { NextResponse } from 'next/server';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createAdminAuthAbortSignal } from '@/lib/adminAuthSecurity';
import { decodeLoginHistoryCursor, encodeLoginHistoryCursor } from '@/lib/adminLoginHistory';
import type { AdminLoginHistoryEntry } from '@/lib/adminLoginHistory';

const PAGE_SIZE = 25;
const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return json({ error: 'Silakan login sebagai admin.' }, 401);
    if (!isSuperAdmin(admin)) return json({ error: 'Riwayat login hanya bisa dilihat superadmin.' }, 403);

    const params = new URL(request.url).searchParams;
    const outcome = params.get('outcome') || 'all';
    const days = params.get('days') || '30';
    const rawCursor = params.get('cursor');
    const cursor = rawCursor === null ? null : decodeLoginHistoryCursor(rawCursor);
    if (!['all', 'success', 'failed', 'blocked'].includes(outcome) || !['7', '30', '90', 'all'].includes(days) || (rawCursor !== null && !cursor)) {
      return json({ error: 'Filter riwayat login tidak valid.' }, 400);
    }

    let query = supabaseAdmin.from('admin_login_history')
      .select('id, occurred_at, admin_id, admin_name, email, outcome, ip_address, user_agent, device_type, browser, os, country_code, region, city, location_source')
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false });
    if (outcome !== 'all') query = query.eq('outcome', outcome);
    if (days !== 'all') query = query.gte('occurred_at', new Date(Date.now() - Number(days) * 86_400_000).toISOString());
    // Both cursor components are validated before entering PostgREST syntax.
    // Retain database timestamp precision so equal-time rows are not skipped.
    if (cursor) query = query.or(`occurred_at.lt.${cursor.at},and(occurred_at.eq.${cursor.at},id.lt.${cursor.id})`);

    const { data, error } = await query.limit(PAGE_SIZE + 1).abortSignal(createAdminAuthAbortSignal());
    if (error) return json({ error: 'Riwayat login belum dapat dimuat. Silakan coba lagi.' }, 503);
    const rows = (data || []) as AdminLoginHistoryEntry[];
    const logs = rows.slice(0, PAGE_SIZE);
    return json({
      logs,
      nextCursor: rows.length > PAGE_SIZE ? encodeLoginHistoryCursor(logs[logs.length - 1]) : null,
    });
  } catch {
    return json({ error: 'Riwayat login belum dapat dimuat. Silakan coba lagi.' }, 503);
  }
}
