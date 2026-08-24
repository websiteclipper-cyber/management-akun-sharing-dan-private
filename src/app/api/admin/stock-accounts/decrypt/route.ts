import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';
import { getAdminFromRequest } from '@/lib/auth';

// Credentials are decrypted only after the application admin token is verified.

export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accountId = request.nextUrl.searchParams.get('id');
    const credential = request.nextUrl.searchParams.get('credential') || 'password';
    if (!accountId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    if (credential !== 'password' && credential !== 'two_factor') {
      return NextResponse.json({ error: 'Credential tidak valid' }, { status: 400 });
    }

    const credentialField = credential === 'two_factor'
      ? 'two_factor_secret_encrypted'
      : 'account_secret_encrypted';

    // Ambil akun dari database
    const { data: account, error } = await supabase
      .from('stock_accounts')
      .select('account_secret_encrypted, two_factor_secret_encrypted')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Account tidak ditemukan' }, { status: 404 });
    }

    const encryptedSecret = account[credentialField];
    if (!encryptedSecret) {
      return NextResponse.json({ secret: '' }, { status: 200 });
    }

    const decryptedSecret = decrypt(encryptedSecret);

    return NextResponse.json({ secret: decryptedSecret }, { status: 200 });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to decrypt', detail }, { status: 500 });
  }
}
