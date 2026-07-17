import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';
import { getAdminFromRequest } from '@/lib/auth';

// Password is decrypted only after the application admin token is verified.

export async function GET(request: NextRequest) {
  if (!getAdminFromRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accountId = request.nextUrl.searchParams.get('id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    // Ambil akun dari database
    const { data: account, error } = await supabase
      .from('stock_accounts')
      .select('account_secret_encrypted')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Account tidak ditemukan' }, { status: 404 });
    }

    if (!account.account_secret_encrypted) {
      return NextResponse.json({ secret: '' }, { status: 200 });
    }

    // Decrypt password
    const decryptedSecret = decrypt(account.account_secret_encrypted);

    return NextResponse.json({ secret: decryptedSecret }, { status: 200 });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to decrypt', detail }, { status: 500 });
  }
}
