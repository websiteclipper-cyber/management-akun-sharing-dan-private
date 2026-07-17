import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/crypto';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getBuyerFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const buyer = getBuyerFromRequest(request);
    if (!buyer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { encrypted } = await request.json();

    if (!encrypted) {
      return NextResponse.json({ error: 'No data' }, { status: 400 });
    }

    // A buyer may decrypt a password only when it belongs to one of their
    // active account assignments. Do not treat ciphertext as an access token.
    const { data: assignment, error: assignmentError } = await supabase
      .from('account_assignments')
      .select('id, orders!inner(buyer_id), stock_accounts!inner(account_secret_encrypted)')
      .eq('orders.buyer_id', buyer.id)
      .eq('stock_accounts.account_secret_encrypted', encrypted)
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
