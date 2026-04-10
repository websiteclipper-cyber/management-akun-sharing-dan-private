import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { signToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { ref_code, pin } = await request.json();

    if (!ref_code || !pin) {
      return NextResponse.json({ error: 'Kode referral dan PIN wajib diisi' }, { status: 400 });
    }

    // Find reseller by ref_code (case insensitive)
    const { data: reseller, error } = await supabase
      .from('resellers')
      .select('*')
      .ilike('ref_code', ref_code.trim())
      .single();

    if (error || !reseller) {
      return NextResponse.json({ error: 'Kode referral tidak ditemukan' }, { status: 404 });
    }

    // Verify PIN matches
    if (!reseller.pin || pin.trim() !== reseller.pin) {
      return NextResponse.json({ error: 'PIN tidak valid' }, { status: 401 });
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
