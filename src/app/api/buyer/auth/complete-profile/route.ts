import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { findBuyerByVerifiedEmail } from '@/lib/buyerProfile';
import { normalizeWhatsAppPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  const email = authData.user?.email?.trim().toLowerCase();
  if (authError || !email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const phone = normalizeWhatsAppPhone(body.phone);
  if (name.length < 2 || name.length > 100) {
    return NextResponse.json({ error: 'Nama harus terdiri dari 2–100 karakter.' }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({
      error: 'Nomor WhatsApp tidak valid. Untuk nomor luar Indonesia, sertakan kode negara (contoh +60123456789).',
    }, { status: 400 });
  }

  let existingBuyer;
  try {
    existingBuyer = await findBuyerByVerifiedEmail(email);
  } catch {
    return NextResponse.json({ error: 'Gagal membaca profil buyer.' }, { status: 500 });
  }
  if (existingBuyer?.status && existingBuyer.status !== 'active') {
    return NextResponse.json({ error: 'Akun buyer tidak aktif.' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const result = existingBuyer
    ? await supabaseAdmin
        .from('buyers')
        .update({ name, phone, updated_at: now })
        .eq('id', existingBuyer.id)
        .select('id, name, email, phone, status')
        .single()
    : await supabaseAdmin
        .from('buyers')
        .insert({ name, email, phone, status: 'active', created_at: now, updated_at: now })
        .select('id, name, email, phone, status')
        .single();

  if (result.error || !result.data) {
    return NextResponse.json({ error: 'Gagal menyimpan profil buyer.' }, { status: 500 });
  }

  const buyer = result.data;
  const token = signToken({
    type: 'buyer',
    id: buyer.id,
    name: buyer.name,
    email: buyer.email || email,
    phone: buyer.phone || phone,
  }, 24);

  return NextResponse.json({
    token,
    buyer: { id: buyer.id, name: buyer.name, email: buyer.email, phone: buyer.phone },
  });
}
