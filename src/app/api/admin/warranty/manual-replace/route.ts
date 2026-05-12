import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';

/**
 * POST /api/admin/warranty/manual-replace
 * Admin manually assigns a backup account to resolve a warranty claim.
 */
export async function POST(request: NextRequest) {
  try {
    const { claim_id, backup_account_id, admin_notes } = await request.json();

    if (!claim_id || !backup_account_id) {
      return NextResponse.json(
        { error: 'claim_id dan backup_account_id diperlukan' },
        { status: 400 }
      );
    }

    // 1. Get the claim
    const { data: claim, error: claimErr } = await supabase
      .from('warranty_claims')
      .select('*, orders(id, buyer_id)')
      .eq('id', claim_id)
      .single();

    if (claimErr || !claim) {
      return NextResponse.json({ error: 'Klaim tidak ditemukan' }, { status: 404 });
    }

    if (claim.status === 'auto_replaced') {
      return NextResponse.json(
        { error: 'Klaim ini sudah di-replace secara otomatis' },
        { status: 400 }
      );
    }

    // 2. Get the backup account
    const { data: backup, error: backupErr } = await supabase
      .from('backup_accounts')
      .select('*')
      .eq('id', backup_account_id)
      .single();

    if (backupErr || !backup) {
      return NextResponse.json({ error: 'Akun backup tidak ditemukan' }, { status: 404 });
    }

    if (backup.is_used) {
      return NextResponse.json(
        { error: 'Akun backup ini sudah digunakan' },
        { status: 400 }
      );
    }

    // 3. Decrypt the backup password
    let newPasswordDecrypted = '';
    try {
      newPasswordDecrypted = decrypt(backup.account_secret_encrypted);
    } catch {
      newPasswordDecrypted = backup.account_secret_encrypted;
    }

    // 4. Mark backup as used
    await supabase.from('backup_accounts').update({
      is_used: true,
      status: 'used',
      used_for_order_id: claim.order_id,
      used_at: new Date().toISOString(),
    }).eq('id', backup_account_id);

    // 5. Mark old assignment as replaced (if exists)
    if (claim.assignment_id) {
      await supabase.from('account_assignments').update({
        status: 'replaced',
        updated_at: new Date().toISOString(),
      }).eq('id', claim.assignment_id);
    }

    // 6. Update the warranty claim
    const { data: updated, error: updateErr } = await supabase
      .from('warranty_claims')
      .update({
        status: 'auto_replaced', // same status as auto — means resolved
        replacement_backup_id: backup_account_id,
        new_email: backup.account_identifier,
        new_password_encrypted: backup.account_secret_encrypted,
        resolution_notes: 'Admin manual replacement — akun cadangan telah diberikan.',
        admin_notes: admin_notes || 'Manual replace oleh admin.',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claim_id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ...updated,
      new_email: backup.account_identifier,
      new_password: newPasswordDecrypted,
      message: 'Akun berhasil diganti secara manual',
    });
  } catch (error: any) {
    console.error('Manual replace error:', error);
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan sistem' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/warranty/manual-replace?product_id=xxx
 * Fetches available (unused) backup accounts for a given product
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');

    if (!productId) {
      return NextResponse.json({ error: 'product_id diperlukan' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('backup_accounts')
      .select('id, account_identifier, product_id, stock_account_id, sort_order, created_at')
      .eq('product_id', productId)
      .eq('is_used', false)
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
