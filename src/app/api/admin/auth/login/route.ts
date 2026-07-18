import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';
import {
  checkAdminAuthRateLimit,
  cleanupAdminAuthEvents,
  clearAdminLoginFailures,
  DUMMY_ADMIN_PASSWORD_HASH,
  getAdminAuthFingerprint,
  normalizeAdminEmail,
  recordAdminAuthEvent,
} from '@/lib/adminAuthSecurity';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const normalizedEmail = normalizeAdminEmail(email);

    if (!normalizedEmail || typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 });
    }

    const fingerprint = getAdminAuthFingerprint(request, normalizedEmail);
    const rateLimit = await checkAdminAuthRateLimit(fingerprint, {
      eventType: 'login_failure',
      windowMinutes: 15,
      maxPerEmail: 5,
      maxPerIp: 20,
    });

    if (rateLimit.limited) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, name, email, role, status, password_hash, token_version')
      .ilike('email', normalizedEmail)
      .eq('status', 'active')
      .maybeSingle();

    const validPassword = await bcrypt.compare(
      password,
      admin?.password_hash || DUMMY_ADMIN_PASSWORD_HASH,
    );
    if (error || !admin || !validPassword) {
      await recordAdminAuthEvent(fingerprint, 'login_failure');
      return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 });
    }

    await clearAdminLoginFailures(fingerprint);
    await cleanupAdminAuthEvents();

    // Update last login
    await supabase
      .from('admins')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', admin.id);

    // Generate JWT token
    const token = signToken({
      type: 'admin',
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      tokenVersion: Number(admin.token_version || 0),
    }, 12);

    return NextResponse.json({
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      token,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
