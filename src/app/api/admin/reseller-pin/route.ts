import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { reseller_id, new_pin } = await request.json();

    if (!reseller_id || !new_pin) {
      return NextResponse.json({ error: 'reseller_id dan new_pin wajib diisi' }, { status: 400 });
    }

    if (new_pin.length < 4 || new_pin.length > 20) {
      return NextResponse.json({ error: 'PIN harus antara 4–20 karakter' }, { status: 400 });
    }

    // Hash the new PIN
    const hashedPin = await bcrypt.hash(new_pin.trim(), 10);

    const { error } = await supabase
      .from('resellers')
      .update({ pin: hashedPin })
      .eq('id', reseller_id);

    if (error) {
      return NextResponse.json({ error: 'Gagal update PIN: ' + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'PIN berhasil diubah' });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
