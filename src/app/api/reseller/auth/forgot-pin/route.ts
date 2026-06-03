import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { ref_code, phone } = await request.json();

    if (!ref_code || !phone) {
      return NextResponse.json({ error: 'Kode referral dan No. WhatsApp wajib diisi' }, { status: 400 });
    }

    // Rate limiting logic: Check how many resets today for this ref_code
    // We'll reuse reseller_login_attempts table for simplicity or create a new logic
    // But since it's just a simple check, we can just fetch and update.
    // For simplicity without adding a new table, we'll just check if the reseller exists
    
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const { data: reseller, error } = await supabase
      .from('resellers')
      .select('id, phone')
      .ilike('ref_code', ref_code.trim())
      .single();

    if (error || !reseller) {
      return NextResponse.json({ error: 'Data tidak valid. Pastikan Kode Referral dan No. WA benar.' }, { status: 404 });
    }

    // Match phone
    if (reseller.phone !== cleanPhone) {
       return NextResponse.json({ error: 'Data tidak valid. Pastikan Kode Referral dan No. WA benar.' }, { status: 401 });
    }

    // Generate random 6-digit PIN
    const newPin = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash it
    const hashedPin = await bcrypt.hash(newPin, 10);

    // Update DB
    const { error: updateError } = await supabase
      .from('resellers')
      .update({ pin: hashedPin })
      .eq('id', reseller.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Return new pin
    return NextResponse.json({ 
      success: true, 
      message: 'PIN berhasil direset',
      new_pin: newPin
    });

  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
