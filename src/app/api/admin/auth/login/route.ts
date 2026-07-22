import { after, NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';
import {
  checkAdminAuthRateLimit,
  cleanupAdminAuthEvents,
  clearAdminLoginFailures,
  createAdminAuthAbortSignal,
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
    const rateLimitPromise = checkAdminAuthRateLimit(fingerprint, {
      eventType: 'login_failure',
      windowMinutes: 15,
      maxPerEmail: 5,
      maxPerIp: 20,
    });

    const adminPromise = supabase
      .from('admins')
      .select('id, name, email, role, status, password_hash, token_version')
      .ilike('email', normalizedEmail)
      .eq('status', 'active')
      .abortSignal(createAdminAuthAbortSignal())
      .maybeSingle();

    // The rate-limit checks and admin lookup are independent. Running them
    // together removes one database round trip from the critical login path.
    const [rateLimit, { data: admin, error }] = await Promise.all([
      rateLimitPromise,
      adminPromise,
    ]);

    if (rateLimit.limited) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    if (error) {
      throw new Error('Unable to read admin account.');
    }

    const validPassword = await bcrypt.compare(
      password,
      admin?.password_hash || DUMMY_ADMIN_PASSWORD_HASH,
    );
    if (!admin || !validPassword) {
      await recordAdminAuthEvent(fingerprint, 'login_failure');
      return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 });
    }

    // Generate JWT token
    const token = signToken({
      type: 'admin',
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      tokenVersion: Number(admin.token_version || 0),
    }, 12);

    // These writes do not affect whether the credentials are valid. Schedule
    // them after the response so telemetry maintenance cannot delay login.
    after(async () => {
      const results = await Promise.allSettled([
        clearAdminLoginFailures(fingerprint),
        cleanupAdminAuthEvents(),
        supabase
          .from('admins')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', admin.id)
          .abortSignal(createAdminAuthAbortSignal()),
      ]);

      if (results.some(result => result.status === 'rejected')) {
        console.error('Admin login maintenance did not complete.');
      }
    });

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
    return NextResponse.json(
      { error: 'Layanan login sedang lambat. Silakan coba lagi beberapa saat.' },
      { status: 503 },
    );
  }
}
