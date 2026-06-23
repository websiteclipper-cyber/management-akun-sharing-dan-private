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

    // 1.5 Prevent Duplicate/Spam Claims
    const { data: existingClaim } = await supabase
      .from('warranty_claims')
      .select('id, status')
      .eq('order_id', order.id)
      .ilike('reported_email', reported_email)
      .limit(1)
      .maybeSingle();

    if (existingClaim) {
      if (['pending', 'manual_review', 'no_backup'].includes(existingClaim.status)) {
        return NextResponse.json({ error: 'Anda sudah mengajukan klaim untuk akun ini yang sedang diproses. Mohon tunggu.' }, { status: 400 });
      } else {
        return NextResponse.json({ error: 'Klaim garansi untuk akun ini sudah pernah diproses sebelumnya.' }, { status: 400 });
      }
    }

    // 2. Find active assignments for the order
    const { data: assignments } = await supabase
      .from('account_assignments')
      .select('id, stock_account_id, status, expired_at, warranty_expired_at, stock_accounts(id, account_identifier, account_secret_encrypted)')
      .eq('order_id', order.id)
      .in('status', ['active', 'replaced']);

    let assignment: any = null;
    let emailMatch = false;
    let passwordMatch = false;

    if (assignments && assignments.length > 0) {
      const exactAssignment = assignments.find((a: any) =>
        a.stock_accounts && a.stock_accounts.account_identifier?.toLowerCase() === reported_email.toLowerCase()
      );
      
      if (exactAssignment) {
        assignment = exactAssignment;
        emailMatch = true;
        const stockAccount = (exactAssignment as any).stock_accounts;
        try {
          const decryptedPassword = decrypt(stockAccount.account_secret_encrypted);
          passwordMatch = decryptedPassword === reported_password;
        } catch {
          passwordMatch = stockAccount.account_secret_encrypted === reported_password;
        }
      } else {
        // Fallback to link the claim
        assignment = assignments[0];
      }
    }

    // Generate unique claim code
    const claim_code = 'WC-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    let claimStatus = 'pending';
    let backupAccountId = null;
    let resolutionNotes = '';
    let newEmail = null;
    let newPasswordDecrypted = null;
    let newPasswordEnc = null;

    if (!assignments || assignments.length === 0) {
      claimStatus = 'manual_review';
      resolutionNotes = 'Tidak ada akun aktif untuk pesanan ini. Menunggu pengecekan manual dari admin.';
    } else if (!emailMatch || !passwordMatch) {
      claimStatus = 'manual_review';
      resolutionNotes = 'Email atau password yang dilaporkan tidak cocok dengan data sistem. Menunggu pengecekan manual.';
    } else {
      // Check if warranty has expired
      const warrantyExpiryDate = assignment.warranty_expired_at || assignment.expired_at;
      if (warrantyExpiryDate && new Date(warrantyExpiryDate) < new Date()) {
        claimStatus = 'invalid_claim';
        resolutionNotes = 'Masa garansi pesanan Anda sudah habis.';
      } else {
        // Check if auto replace is enabled (default to false if not found or is false)
        const { data: autoReplaceSetting } = await supabase
          .from('site_settings')
          .select('value')
          .eq('key', 'warranty_auto_replace')
          .maybeSingle();
          
        const isAutoReplaceEnabled = autoReplaceSetting?.value === 'true';

        if (!isAutoReplaceEnabled) {
          claimStatus = 'pending';
          resolutionNotes = 'Laporan Anda telah diterima dan sedang menunggu persetujuan/pengecekan admin.';
        } else {
          // 4. Try auto-replace: find backup for this specific stock account first, then by product
          let backup = null;
          const stockAccount = (assignment as any).stock_accounts;

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
          // If no backup found, try to use a new stock account
          const { data: stockAccounts } = await supabase
            .from('stock_accounts')
            .select('id, account_identifier, account_secret_encrypted, max_slot, current_used_slot')
            .eq('product_id', order.product_id)
            .eq('status', 'active');
            
          const availableStock = stockAccounts?.find(s => s.current_used_slot < s.max_slot);

          if (availableStock) {
            claimStatus = 'auto_replaced';
            newEmail = availableStock.account_identifier;
            newPasswordEnc = availableStock.account_secret_encrypted;

            // Decrypt the backup password to show to buyer
            try {
              newPasswordDecrypted = decrypt(availableStock.account_secret_encrypted);
            } catch {
              newPasswordDecrypted = availableStock.account_secret_encrypted;
            }

            resolutionNotes = 'Sistem otomatis mengganti dengan akun baru dari stok utama.';

            // Mark old assignment as replaced
            await supabase.from('account_assignments').update({
              status: 'replaced',
              updated_at: new Date().toISOString()
            }).eq('id', assignment.id);

            // Create new assignment
            await supabase.from('account_assignments').insert({
              order_id: order.id,
              stock_account_id: availableStock.id,
              status: 'active',
              assigned_at: new Date().toISOString(),
              delivered_at: new Date().toISOString(),
              expired_at: assignment.expired_at,
              warranty_expired_at: assignment.warranty_expired_at
            });

            // Update stock account slot
            await supabase.from('stock_accounts').update({
              current_used_slot: availableStock.current_used_slot + 1,
              updated_at: new Date().toISOString()
            }).eq('id', availableStock.id);

            } else {
              claimStatus = 'no_backup';
              resolutionNotes = 'Tidak ada akun cadangan tersedia. Silakan hubungi admin untuk penanganan manual.';
            }
          }
        }
      }
    }

    // 5. Insert warranty claim
    const { data: claim, error: claimInsertError } = await supabase.from('warranty_claims').insert({
      claim_code,
      order_id: order.id,
      buyer_id: order.buyer_id,
      product_id: order.product_id,
      assignment_id: assignment?.id || null,
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
      const statusEmoji = claimStatus === 'auto_replaced' ? '✅' : (claimStatus === 'pending' ? '⏳' : '⚠️');
      const statusText = claimStatus === 'auto_replaced' 
        ? 'Berhasil Diganti Otomatis' 
        : (claimStatus === 'pending' ? 'Menunggu Persetujuan Admin (Pending)' : 'Butuh Penanganan Manual (Stok Kosong / Error)');
      
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
