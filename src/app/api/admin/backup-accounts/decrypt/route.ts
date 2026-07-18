import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accountId = request.nextUrl.searchParams.get('id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    const { data: account, error } = await supabase
      .from('backup_accounts')
      .select('account_secret_encrypted')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      return NextResponse.json({ error: 'Account tidak ditemukan' }, { status: 404 });
    }

    if (!account.account_secret_encrypted) {
      return NextResponse.json({ secret: '' }, { status: 200 });
    }

    const decryptedSecret = decrypt(account.account_secret_encrypted);

    return NextResponse.json({ secret: decryptedSecret }, { status: 200 });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to decrypt', detail }, { status: 500 });
  }
}
