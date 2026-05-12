import { NextRequest, NextResponse } from 'next';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { order_number, reported_email, reported_password, issue_type, issue_description } = await request.json();

    if (!order_number || !reported_email || !reported_password || !issue_type) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    // 1. Find the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, product_id, status:order_status')
      .eq('order_number', order_number)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pesanan tidak ditemukan' }, { status: 404 });
    }

    // 2. Find active assignment matching the email
    const { data: assignments, error: assignError } = await supabase
      .from('account_assignments')
      .select('id, stock_account_id, status, stock_accounts(account_identifier, account_secret_encrypted)')
      .eq('order_id', order.id)
      .eq('status', 'active');

    if (assignError || !assignments || assignments.length === 0) {
      return NextResponse.json({ error: 'Tidak ada akun aktif untuk pesanan ini' }, { status: 404 });
    }

    const assignment = assignments.find(a => 
      a.stock_accounts && a.stock_accounts.account_identifier === reported_email
    );

    if (!assignment) {
      return NextResponse.json({ error: 'Email yang dilaporkan tidak cocok dengan akun pesanan Anda' }, { status: 400 });
    }

    // Generate unique claim code
    const claim_code = 'WARR-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // Verify password logic could be added here, but usually buyers just report it's not working.
    // For auto-replacement, we check if there's a backup available.
    
    let claimStatus = 'pending';
    let backupAccountId = null;
    let resolutionNotes = '';
    let newEmail = null;
    let newPasswordEnc = null;

    // Try auto-replace
    const { data: backup, error: backupError } = await supabase
      .from('backup_accounts')
      .select('id, account_identifier, account_secret_encrypted')
      .eq('product_id', order.product_id)
      .eq('status', 'available')
      .eq('is_used', false)
      .order('sort_order', { ascending: true })
      .limit(1)
      .single();

    if (backup && !backupError) {
      // Auto replace successful!
      claimStatus = 'auto_replaced';
      backupAccountId = backup.id;
      newEmail = backup.account_identifier;
      newPasswordEnc = backup.account_secret_encrypted;
      resolutionNotes = 'Sistem otomatis mengganti dengan akun backup.';

      // Mark backup as used
      await supabase.from('backup_accounts').update({
        status: 'used',
        is_used: true,
        used_for_order_id: order.id,
        used_at: new Date().toISOString()
      }).eq('id', backup.id);

      // (Optional) We could also create a new assignment, but for now we just link the replacement to the claim
      // and maybe mark the old assignment as replaced.
      await supabase.from('account_assignments').update({
        status: 'replaced'
      }).eq('id', assignment.id);
    } else {
      claimStatus = 'no_backup';
      resolutionNotes = 'Sistem menunggu admin untuk mengecek ketersediaan akun pengganti.';
    }

    // Insert warranty claim
    const { data: claim, error: claimInsertError } = await supabase.from('warranty_claims').insert({
      claim_code,
      order_id: order.id,
      buyer_id: order.buyer_id,
      product_id: order.product_id,
      assignment_id: assignment.id,
      reported_email,
      reported_password,
      reason: issue_type + (issue_description ? ' - ' + issue_description : ''),
      status: claimStatus,
      replacement_backup_id: backupAccountId,
      new_email: newEmail,
      new_password_encrypted: newPasswordEnc,
      resolution_notes: resolutionNotes,
      resolved_at: claimStatus === 'auto_replaced' ? new Date().toISOString() : null
    }).select().single();

    if (claimInsertError) {
      return NextResponse.json({ error: claimInsertError.message }, { status: 400 });
    }

    return NextResponse.json(claim);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
