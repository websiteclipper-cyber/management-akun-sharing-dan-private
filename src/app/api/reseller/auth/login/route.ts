import { after, NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import {
  checkResellerRequestRateLimit,
  cleanupResellerLoginFailures,
  clearResellerLoginFailures,
  createResellerAuthAbortSignal,
  getResellerClientIp,
  normalizeResellerRefCode,
  recordResellerLoginFailure,
} from '@/lib/resellerAuthSecurity';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const { ref_code, pin } = await request.json();
    const refCode = normalizeResellerRefCode(ref_code);

    if (!refCode || typeof pin !== 'string' || !pin || pin.length > 32) {
      return NextResponse.json({ error: 'Kode referral dan PIN wajib diisi' }, { status: 400 });
    }

    const ip = getResellerClientIp(request);
    const requestRateLimit = checkResellerRequestRateLimit(ip);
    if (requestRateLimit.limited) {
      return NextResponse.json(
        { error: 'Terlalu banyak permintaan. Silakan coba lagi sebentar.' },
        {
          status: 429,
          headers: { 'Retry-After': String(requestRateLimit.retryAfterSeconds) },
        },
      );
    }

    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const attemptsPromise = supabase
      .from('reseller_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ref_code', refCode)
      .gte('attempted_at', fifteenMinsAgo)
      .abortSignal(createResellerAuthAbortSignal());

    const resellerPromise = supabase
      .from('resellers')
      .select('id, name, ref_code, phone, status, pin')
      .eq('ref_code', refCode)
      .abortSignal(createResellerAuthAbortSignal())
      .maybeSingle();

    const [attemptResult, resellerResult] = await Promise.all([
      attemptsPromise,
      resellerPromise,
    ]);

    if (attemptResult.error || resellerResult.error) {
      throw new Error('Unable to read reseller authentication data.');
    }

    const attempts = attemptResult.count || 0;
    if (attempts >= 5) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan gagal. Silakan coba lagi dalam 15 menit.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const reseller = resellerResult.data;
    if (!reseller) {
      await recordResellerLoginFailure(refCode, ip);
      return NextResponse.json({ error: 'Kode referral tidak ditemukan' }, { status: 404 });
    }

    // Verify PIN matches
    const dbPin = String(reseller.pin || '').trim();
    const inputPin = pin.trim();
    
    let isPinValid = false;
    let needsMigration = false;

    // Check if dbPin is hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
    if (dbPin.startsWith('$2a$') || dbPin.startsWith('$2b$') || dbPin.startsWith('$2y$')) {
      isPinValid = await bcrypt.compare(inputPin, dbPin);
    } else {
      // Fallback for unhashed PINs
      isPinValid = (inputPin === dbPin);
      if (isPinValid) {
        needsMigration = true; // Mark for auto-migration
      }
    }

    if (!isPinValid) {
      await recordResellerLoginFailure(refCode, ip);
      const remainingAttempts = 4 - attempts;
      return NextResponse.json({ error: `PIN tidak valid. Sisa ${remainingAttempts} percobaan.` }, { status: 401 });
    }

    // Check if reseller is active
    if (reseller.status !== 'active') {
      return NextResponse.json({ error: 'Akun reseller Anda tidak aktif. Hubungi admin.' }, { status: 403 });
    }

    // Sign JWT token
    const token = signToken({
      type: 'reseller',
      id: reseller.id,
      name: reseller.name,
      email: '', // resellers don't have email
      ref_code: reseller.ref_code,
      phone: reseller.phone,
    }, 168); // 7 days

    after(async () => {
      const maintenanceTasks: PromiseLike<unknown>[] = [
        clearResellerLoginFailures(refCode, ip),
        cleanupResellerLoginFailures(),
        supabase
          .from('resellers')
          .update({
            last_login_ip: ip,
            last_login_at: new Date().toISOString(),
          })
          .eq('id', reseller.id)
          .abortSignal(createResellerAuthAbortSignal()),
      ];

      if (needsMigration) {
        maintenanceTasks.push((async () => {
          const hashedPin = await bcrypt.hash(inputPin, 10);
          const { error } = await supabase
            .from('resellers')
            .update({ pin: hashedPin })
            .eq('id', reseller.id)
            .abortSignal(createResellerAuthAbortSignal());

          if (error) throw new Error('Unable to migrate reseller PIN.');
        })());
      }

      const results = await Promise.allSettled(maintenanceTasks);
      if (results.some(result => result.status === 'rejected')) {
        console.error('Reseller login maintenance did not complete.');
      }
    });

    return NextResponse.json({
      success: true,
      token,
      reseller: {
        id: reseller.id,
        name: reseller.name,
        ref_code: reseller.ref_code,
        phone: reseller.phone,
        status: reseller.status,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Layanan login sedang sibuk. Silakan coba lagi beberapa saat.' },
      { status: 503 },
    );
  }
}
