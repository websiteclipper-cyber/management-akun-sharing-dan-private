import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import crypto from 'crypto';
import { sendTelegramNotification } from '@/lib/telegram';

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function escapeTelegramHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const orderNumber = normalizeText(payload.order_number, 100);
    const reportedEmail = normalizeText(payload.reported_email, 320);
    const issueType = normalizeText(payload.issue_type, 100);
    const issueDescription = normalizeText(payload.issue_description, 2000);

    if (!orderNumber || !reportedEmail || !issueType) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    // The order must exist so the claim can be linked to the correct buyer and product.
    // Warranty eligibility is deliberately decided by an admin, not by this endpoint.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, product_id, order_status')
      .eq('order_number', orderNumber)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pesanan tidak ditemukan. Pastikan kode pesanan benar.' }, { status: 404 });
    }

    // Prevent duplicate claims for the same order and reported account.
    const { data: existingClaim } = await supabase
      .from('warranty_claims')
      .select('id, status')
      .eq('order_id', order.id)
      .ilike('reported_email', reportedEmail)
      .limit(1)
      .maybeSingle();

    if (existingClaim) {
      if (['pending', 'approved', 'manual_review', 'no_backup'].includes(existingClaim.status)) {
        return NextResponse.json({ error: 'Anda sudah mengajukan klaim untuk akun ini yang sedang diproses. Mohon tunggu.' }, { status: 400 });
      }

      return NextResponse.json({ error: 'Klaim garansi untuk akun ini sudah pernah diproses sebelumnya.' }, { status: 400 });
    }

    // Link the closest assignment only as context for the admin review. Sensitive
    // account credentials are intentionally not read or compared in this public flow.
    const { data: assignments, error: assignmentError } = await supabase
      .from('account_assignments')
      .select('id, stock_account_id, status, expired_at, warranty_expired_at, stock_accounts(id, account_identifier)')
      .eq('order_id', order.id)
      .in('status', ['active', 'replaced']);

    if (assignmentError) {
      return NextResponse.json({ error: 'Gagal memuat data pesanan untuk peninjauan.' }, { status: 500 });
    }

    const exactAssignment = assignments?.find((item) => {
      const account = Array.isArray(item.stock_accounts)
        ? item.stock_accounts[0]
        : item.stock_accounts;
      return account?.account_identifier?.toLowerCase() === reportedEmail.toLowerCase();
    });
    const assignment = exactAssignment || assignments?.[0] || null;
    const claimCode = `WC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const resolutionNotes = 'Pengajuan diterima dan menunggu peninjauan manual admin sesuai ketentuan garansi. Admin akan memutuskan klaim diterima atau ditolak.';

    // Every new claim starts as pending. Only the authenticated admin endpoint may
    // make the approval or rejection decision.
    const { data: claim, error: claimInsertError } = await supabase.from('warranty_claims').insert({
      claim_code: claimCode,
      order_id: order.id,
      buyer_id: order.buyer_id,
      product_id: order.product_id,
      assignment_id: assignment?.id || null,
      reported_email: reportedEmail,
      reported_password: '***hidden***',
      reason: issueType + (issueDescription ? ` - ${issueDescription}` : ''),
      issue_type: issueType,
      issue_description: issueDescription || null,
      status: 'pending',
      replacement_backup_id: null,
      new_email: null,
      new_password_encrypted: null,
      resolution_notes: resolutionNotes,
      resolved_at: null
    }).select('claim_code, status, resolution_notes').single();

    if (claimInsertError) {
      return NextResponse.json({ error: claimInsertError.message }, { status: 400 });
    }

    try {
      const message = `
<b>⏳ Pengajuan Garansi Baru</b>
Order: <code>${escapeTelegramHtml(orderNumber)}</code>
Email: <code>${escapeTelegramHtml(reportedEmail)}</code>
Masalah: ${escapeTelegramHtml(issueType)}

Status: <b>Menunggu Peninjauan Admin</b>
<i>Periksa validitas pesanan dan putuskan klaim diterima atau ditolak dari dashboard Garansi.</i>
      `.trim();

      await sendTelegramNotification(message);
    } catch (error) {
      console.error('Failed to send telegram notification', error);
    }

    return NextResponse.json(claim, { status: 201 });
  } catch (error: unknown) {
    console.error('Warranty claim error:', error);
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan sistem';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
