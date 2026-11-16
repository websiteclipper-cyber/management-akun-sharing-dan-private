import { after, NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';
import { recordAdminLoginAttempt } from '@/lib/adminLoginHistory';
import { readJsonBody } from '@/lib/publicApiSecurity';
import {
  checkAdminLoginCooldown,
  cleanupAdminAuthEvents,
  clearAdminLoginFailures,
  createAdminAuthAbortSignal,
  DUMMY_ADMIN_PASSWORD_HASH,
  getAdminAuthFingerprint,
  normalizeAdminEmail,
  recordAdminAuthEvent,
} from '@/lib/adminAuthSecurity';

function cooldownResponse(retryAfterSeconds: number) {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const wait = hours > 0
    ? `${hours} jam${minutes % 60 ? ` ${minutes % 60} menit` : ''}`
    : `${minutes} menit`;
  return NextResponse.json(
    { error: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${wait}.`, retryAfterSeconds },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{ email?: unknown; password?: unknown }>(request, 4096);
    const { email, password } = body || {};
    const normalizedEmail = normalizeAdminEmail(email);

    if (!normalizedEmail || normalizedEmail.length > 254 || typeof password !== 'string' || !password || password.length > 128) {
      return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 });
    }

    const loginStartedAt = new Date().toISOString();
    const fingerprint = getAdminAuthFingerprint(request, normalizedEmail);
    const rateLimitPromise = checkAdminLoginCooldown(fingerprint);

    const adminPromise = supabase
      .from('admins')
      .select('id, name, email, role, status, password_hash, token_version')
      .ilike('email', normalizedEmail.replace(/[\\%_]/g, '\\$&'))
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
      await recordAdminLoginAttempt(request, { email: normalizedEmail, outcome: 'blocked', admin });
      return cooldownResponse(rateLimit.retryAfterSeconds);
    }

    if (error) {
      throw new Error('Unable to read admin account.');
    }

    const validPassword = await bcrypt.compare(
      password,
      admin?.password_hash || DUMMY_ADMIN_PASSWORD_HASH,
    );
    if (!admin || !validPassword) {
      await Promise.all([
        recordAdminAuthEvent(fingerprint, 'login_failure'),
        recordAdminLoginAttempt(request, { email: normalizedEmail, outcome: 'failed', admin }),
      ]);
      // The fifth failed password starts the cooldown immediately, rather than
      // waiting for the next login request to tell the client it is blocked.
      const cooldown = await checkAdminLoginCooldown(fingerprint);
      if (cooldown.limited) return cooldownResponse(cooldown.retryAfterSeconds);
      return NextResponse.json({ error: 'Email atau password salah' }, { status: 401 });
    }

    // A concurrent failed request may have started a cooldown while bcrypt
    // was running. Check again before issuing access or clearing any failures.
    const currentCooldown = await checkAdminLoginCooldown(fingerprint);
    if (currentCooldown.limited) {
      await recordAdminLoginAttempt(request, { email: normalizedEmail, outcome: 'blocked', admin });
      return cooldownResponse(currentCooldown.retryAfterSeconds);
    }

    // Persist evidence before issuing access. Rate-limit maintenance below must
    // never delete this separate, append-only login history.
    await recordAdminLoginAttempt(request, { email: normalizedEmail, outcome: 'success', admin });

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
        clearAdminLoginFailures(fingerprint, loginStartedAt),
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
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'UNSUPPORTED_CONTENT_TYPE')) {
      return NextResponse.json({ error: 'Format permintaan login tidak valid.' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
      return NextResponse.json({ error: 'Permintaan login terlalu besar.' }, { status: 413 });
    }
    return NextResponse.json(
      { error: 'Layanan login sedang lambat. Silakan coba lagi beberapa saat.' },
      { status: 503 },
    );
  }
}
