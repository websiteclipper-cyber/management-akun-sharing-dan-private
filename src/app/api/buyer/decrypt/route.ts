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

    const { assignmentId, credentialType = 'password' } = await request.json();
    const normalizedAssignmentId = Number(assignmentId);

    if (!Number.isSafeInteger(normalizedAssignmentId) || normalizedAssignmentId <= 0) {
      return NextResponse.json({ error: 'Invalid assignment' }, { status: 400 });
    }

    if (credentialType !== 'password' && credentialType !== 'two_factor') {
      return NextResponse.json({ error: 'Invalid credential type' }, { status: 400 });
    }

    // Resolve the encrypted value server-side from a unique assignment ID.
    // The buyer never chooses which ciphertext is decrypted, and ownership is
    // still checked against the authenticated buyer on every request.
    const { data: assignment, error: assignmentError } = await supabase
      .from('account_assignments')
      .select('id, orders!inner(buyer_id), stock_accounts!inner(account_secret_encrypted, two_factor_secret_encrypted)')
      .eq('id', normalizedAssignmentId)
      .eq('orders.buyer_id', buyer.id)
      .eq('status', 'active')
      .maybeSingle();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stockAccount = assignment.stock_accounts as unknown as {
      account_secret_encrypted: string | null;
      two_factor_secret_encrypted: string | null;
    };
    const encrypted = credentialType === 'two_factor'
      ? stockAccount?.two_factor_secret_encrypted
      : stockAccount?.account_secret_encrypted;
    if (!encrypted) {
      return NextResponse.json({ error: 'Credential unavailable' }, { status: 404 });
    }

    const decrypted = decrypt(encrypted);
    return NextResponse.json({ decrypted });
  } catch {
    return NextResponse.json({ error: 'Decrypt failed' }, { status: 500 });
  }
}
