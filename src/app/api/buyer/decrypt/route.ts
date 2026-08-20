import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/crypto';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getBuyerAccessFromRequest } from '@/lib/auth';
import { BUYER_BAN_MESSAGE, isBuyerBannedStatus } from '@/lib/buyerBan';

export async function POST(request: NextRequest) {
  try {
    const access = await getBuyerAccessFromRequest(request);
    if (!access) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (isBuyerBannedStatus(access.status)) {
      return NextResponse.json(
        { banned: true, error: BUYER_BAN_MESSAGE },
        { status: 403 },
      );
    }
    if (access.status !== 'active') {
      return NextResponse.json({ error: 'Akun buyer tidak aktif.' }, { status: 403 });
    }
    const buyer = access.buyer;

    const { encrypted, credentialType = 'password' } = await request.json();

    if (!encrypted) {
      return NextResponse.json({ error: 'No data' }, { status: 400 });
    }

    if (credentialType !== 'password' && credentialType !== 'two_factor') {
      return NextResponse.json({ error: 'Invalid credential type' }, { status: 400 });
    }

    // A buyer may decrypt a credential only when it belongs to one of their
    // active account assignments. Do not treat ciphertext as an access token.
    const credentialField = credentialType === 'two_factor'
      ? 'two_factor_secret_encrypted'
      : 'account_secret_encrypted';
    const { data: assignment, error: assignmentError } = await supabase
      .from('account_assignments')
      .select('id, orders!inner(buyer_id), stock_accounts!inner(account_secret_encrypted, two_factor_secret_encrypted)')
      .eq('orders.buyer_id', buyer.id)
      .eq(`stock_accounts.${credentialField}`, encrypted)
      .eq('status', 'active')
      .maybeSingle();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const decrypted = decrypt(encrypted);
    return NextResponse.json({ decrypted });
  } catch {
    return NextResponse.json({ error: 'Decrypt failed' }, { status: 500 });
  }
}
