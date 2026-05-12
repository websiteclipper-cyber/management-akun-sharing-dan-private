import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/crypto';
import crypto from 'crypto';
import { sendTelegramNotification } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const { order_number, reported_email, reported_password, issue_type, issue_description } = await request.json();

    if (!order_number || !reported_email || !reported_password || !issue_type) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    // 1. Find the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, product_id, order_status')
      .eq('order_number', order_number)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pesanan tidak ditemukan. Pastikan kode pesanan benar.' }, { status: 404 });
    }

    // 2. Find active assignment matching the email
    const { data: assignments, error: assignError } = await supabase
      .from('account_assignments')
      .select('id, stock_account_id, status, expired_at, stock_accounts(id, account_identifier, account_secret_encrypted)')
      .eq('order_id', order.id)
      .in('status', ['active', 'replaced']);

    if (assignError || !assignments || assignments.length === 0) {
      return NextResponse.json({ error: 'Tidak ada akun aktif untuk pesanan ini' }, { status: 404 });
    }

    // Find matching assignment by reported email
    const assignment = assignments.find((a: any) =>
      a.stock_accounts && a.stock_accounts.account_identifier?.toLowerCase() === reported_email.toLowerCase()
    );

    if (!assignment) {
      return NextResponse.json({ error: 'Email yang dilaporkan tidak cocok dengan akun pesanan Anda' }, { status: 400 });
    }

    // Check if warranty has expired
    if (assignment.expired_at && new Date(assignment.expired_at) < new Date()) {
      return NextResponse.json({ error: 'Masa garansi pesanan Anda sudah habis.' }, { status: 400 });
    }

    // 3. Verify password - decrypt and compare
    const stockAccount = (assignment as any).stock_accounts;
    let passwordMatch = false;
    try {
      const decryptedPassword = decrypt(stockAccount.account_secret_encrypted);
      passwordMatch = decryptedPassword === reported_password;
    } catch {
      // If decryption fails (e.g. plain text or broken), do direct compare
      passwordMatch = stockAccount.account_secret_encrypted === reported_password;
    }

    if (!passwordMatch) {
      // Generate claim code anyway for tracking invalid claims
      const invalidClaimCode = 'WC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      
      await supabase.from('warranty_claims').insert({
        claim_code: invalidClaimCode,
        order_id: order.id,
        assignment_id: assignment.id,
        buyer_id: order.buyer_id,
        product_id: order.product_id,
        reported_email,
        reported_password: '***hidden***',
        reason: issue_type + (issue_description ? ' - ' + issue_description : ''),
        issue_type,
        issue_description,
        status: 'invalid_claim',
        resolution_notes: 'Password yang diinput tidak cocok dengan akun yang diberikan.',
      });

      return NextResponse.json({ error: 'Data akun tidak cocok. Pastikan email dan password yang Anda masukkan benar.' }, { status: 400 });
    }

    // Generate unique claim code
    const claim_code = 'WC-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    let claimStatus = 'pending';
    let backupAccountId = null;
    let resolutionNotes = '';
    let newEmail = null;
    let newPasswordDecrypted = null;
    let newPasswordEnc = null;

    // 4. Try auto-replace: find backup for this specific stock account first, then by product
    let backup = null;

    // First try: backup linked to the specific stock account
    const { data: stockBackup } = await supabase
      .from('backup_accounts')
      .select('id, account_identifier, account_secret_encrypted')
      .eq('stock_account_id', stockAccount.id)
      .eq('is_used', false)
      .order('sort_order', { ascending: true })
      .limit(1)
      .single();

    if (stockBackup) {
      backup = stockBackup;
    } else {
      // Second try: backup linked to the same product
      const { data: productBackup } = await supabase
        .from('backup_accounts')
        .select('id, account_identifier, account_secret_encrypted')
        .eq('product_id', order.product_id)
        .eq('is_used', false)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single();

      if (productBackup) {
        backup = productBackup;
      }
    }

    if (backup) {
      // Auto replace successful!
      claimStatus = 'auto_replaced';
      backupAccountId = backup.id;
      newEmail = backup.account_identifier;
      newPasswordEnc = backup.account_secret_encrypted;

      // Decrypt the backup password to show to buyer
      try {
        newPasswordDecrypted = decrypt(backup.account_secret_encrypted);
      } catch {
        newPasswordDecrypted = backup.account_secret_encrypted;
      }

      resolutionNotes = 'Sistem otomatis mengganti dengan akun cadangan.';

      // Mark backup as used
      await supabase.from('backup_accounts').update({
        is_used: true,
        status: 'used',
        used_for_order_id: order.id,
        used_at: new Date().toISOString()
      }).eq('id', backup.id);

      // Mark old assignment as replaced
      await supabase.from('account_assignments').update({
        status: 'replaced',
        updated_at: new Date().toISOString()
      }).eq('id', assignment.id);
    } else {
      claimStatus = 'no_backup';
      resolutionNotes = 'Tidak ada akun cadangan tersedia. Silakan hubungi admin untuk penanganan manual.';
    }

    // 5. Insert warranty claim
    const { data: claim, error: claimInsertError } = await supabase.from('warranty_claims').insert({
      claim_code,
      order_id: order.id,
      buyer_id: order.buyer_id,
      product_id: order.product_id,
      assignment_id: assignment.id,
      reported_email,
      reported_password: '***hidden***',
      reason: issue_type + (issue_description ? ' - ' + issue_description : ''),
      issue_type,
      issue_description,
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

    // Send Telegram Notification
    try {
      const statusEmoji = claimStatus === 'auto_replaced' ? '✅' : '⚠️';
      const statusText = claimStatus === 'auto_replaced' ? 'Berhasil Diganti Otomatis' : 'Butuh Penanganan Manual (Stok Kosong)';
      
      const message = `
<b>${statusEmoji} Laporan Garansi Baru!</b>
Order: <code>${order_number}</code>
Email: <code>${reported_email}</code>
Masalah: ${issue_type}

Status: <b>${statusText}</b>
${claimStatus !== 'auto_replaced' ? '\n<i>Silakan cek dashboard admin untuk memproses klaim ini.</i>' : ''}
      `.trim();

      await sendTelegramNotification(message);
    } catch (e) {
      console.error('Failed to send telegram notification', e);
    }

    // Return result to buyer
    return NextResponse.json({
      ...claim,
      // Include decrypted password for auto_replaced so buyer can see it
      new_password: claimStatus === 'auto_replaced' ? newPasswordDecrypted : undefined,
    });
  } catch (error: any) {
    console.error('Warranty claim error:', error);
    return NextResponse.json({ error: error.message || 'Terjadi kesalahan sistem' }, { status: 500 });
  }
}
