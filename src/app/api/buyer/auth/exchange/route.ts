import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { findBuyerByVerifiedEmail } from '@/lib/buyerProfile';
import { BUYER_BAN_MESSAGE, isBuyerBannedStatus } from '@/lib/buyerBan';
import {
  isBuyerIdentityBanned,
  recordBannedBuyerIdentity,
} from '@/lib/buyerBanIdentity';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // getUser performs a network check with Supabase Auth; do not trust a decoded
  // JWT or a client-supplied email for this authorization decision.
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  const email = authData.user?.email?.trim().toLowerCase();
  if (authError || !email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let buyer;
  try {
    buyer = await findBuyerByVerifiedEmail(email);
  } catch {
    return NextResponse.json({ error: 'Gagal membaca profil buyer.' }, { status: 500 });
  }

  if (buyer && isBuyerBannedStatus(buyer.status)) {
    await recordBannedBuyerIdentity(buyer.id, request, buyer.email, buyer.phone);
    return NextResponse.json(
      { banned: true, error: BUYER_BAN_MESSAGE },
      { status: 403 },
    );
  }
  if (buyer && buyer.status !== 'active') {
    return NextResponse.json({ error: 'Akun buyer tidak aktif.' }, { status: 403 });
  }

  try {
    if (await isBuyerIdentityBanned({ request, email, phone: buyer?.phone })) {
      return NextResponse.json(
        { banned: true, error: BUYER_BAN_MESSAGE },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json({ error: 'Gagal memeriksa status ban buyer.' }, { status: 500 });
  }

  if (!buyer || !buyer.name?.trim() || !buyer.phone?.trim()) {
    return NextResponse.json({
      needs_profile: true,
      email,
      profile: buyer ? { name: buyer.name || '', phone: buyer.phone || '' } : null,
    });
  }

  const token = signToken({
    type: 'buyer',
    id: buyer.id,
    name: buyer.name,
    email: buyer.email || email,
    phone: buyer.phone || '',
  }, 24);

  return NextResponse.json({
    token,
    buyer: { id: buyer.id, name: buyer.name, email: buyer.email, phone: buyer.phone },
  });
}


