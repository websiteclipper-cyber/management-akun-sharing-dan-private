import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// Helper to calculate rate limit
async function checkRateLimit(supabase: any, ref_code: string, ip: string) {
  // Try to create the table if it doesn't exist
  await supabase.rpc('create_login_attempts_table_if_not_exists').catch(() => {});
  
  // Clean up old attempts (> 15 mins)
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabase
    .from('reseller_login_attempts')
    .delete()
    .lt('attempted_at', fifteenMinsAgo);

  const { count } = await supabase
    .from('reseller_login_attempts')
    .select('*', { count: 'exact', head: true })
    .ilike('ref_code', ref_code)
    .gt('attempted_at', fifteenMinsAgo);

  return count || 0;
}

async function recordFailedAttempt(supabase: any, ref_code: string, ip: string) {
  await supabase.from('reseller_login_attempts').insert({ ref_code, ip_address: ip });
}

async function clearFailedAttempts(supabase: any, ref_code: string) {
  await supabase.from('reseller_login_attempts').delete().ilike('ref_code', ref_code);
}

export async function POST(request: Request) {
  try {
    const { ref_code, pin } = await request.json();

    if (!ref_code || !pin) {
      return NextResponse.json({ error: 'Kode referral dan PIN wajib diisi' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const attempts = await checkRateLimit(supabase, ref_code.trim(), ip);
    
    if (attempts >= 5) {
      return NextResponse.json({ error: 'Terlalu banyak percobaan gagal. Silakan coba lagi dalam 15 menit.' }, { status: 429 });
    }

    // Find reseller by ref_code (case insensitive)
    const { data: reseller, error } = await supabase
      .from('resellers')
      .select('*')
      .ilike('ref_code', ref_code.trim())
      .single();

    if (error || !reseller) {
      await recordFailedAttempt(supabase, ref_code.trim(), ip);
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
      await recordFailedAttempt(supabase, ref_code.trim(), ip);
      const remainingAttempts = 4 - attempts;
      return NextResponse.json({ error: `PIN tidak valid. Sisa ${remainingAttempts} percobaan.` }, { status: 401 });
    }

    // Auto-migrate plaintext PIN to bcrypt hash
    if (needsMigration) {
      try {
        const hashedPin = await bcrypt.hash(inputPin, 10);
        await supabase
          .from('resellers')
          .update({ pin: hashedPin })
          .eq('id', reseller.id);
      } catch (err) {
        console.error('Failed to auto-migrate PIN for reseller:', reseller.id, err);
      }
    }

    // Clear failed attempts on successful login
    await clearFailedAttempts(supabase, ref_code.trim());

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
    } as any, 168); // 7 days

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
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
