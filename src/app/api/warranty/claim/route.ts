import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getBuyerAccessFromRequest } from '@/lib/auth';
import { consumePublicRateLimit, readJsonBody } from '@/lib/publicApiSecurity';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISSUE_TYPES = new Set(['password_changed', 'suspended', 'expired_early', 'other']);

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeOrderNumber(value: unknown) {
  return normalizeText(value, 100)
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^ORDER#?/, '')
    .replace(/^#+/, '');
}

function escapeTelegramHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export async function POST(request: NextRequest) {
  try {
    const access = await getBuyerAccessFromRequest(request);
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (access.status !== 'active') return NextResponse.json({ error: 'Akun buyer tidak aktif.' }, { status: 403 });

    const rateLimit = await consumePublicRateLimit(request, 'warranty', {
      maxRequests: 8,
      windowSeconds: 3600,
      subject: String(access.buyer.id),
    });
    if (rateLimit.limited) {
      return NextResponse.json(
        { error: 'Terlalu banyak pengajuan. Silakan coba lagi nanti.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const payload = await readJsonBody(request);
    const orderNumber = normalizeOrderNumber(payload.order_number);
    const assignmentId = normalizeText(payload.assignment_id, 100);
    const issueType = normalizeText(payload.issue_type, 100);
    const issueDescription = normalizeText(payload.issue_description, 2000);
    const termsAccepted = payload.terms_accepted === true;
    const geminiInviteEmail = normalizeText(payload.gemini_invite_email, 320).toLowerCase();

    if (!orderNumber || !assignmentId || !issueType || issueDescription.length < 10 || !termsAccepted) {
      return NextResponse.json({ error: 'Lengkapi data klaim dan setujui ketentuan garansi.' }, { status: 400 });
    }
    if (!ISSUE_TYPES.has(issueType)) {
      return NextResponse.json({ error: 'Jenis kendala tidak valid.' }, { status: 400 });
    }

    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, product_id, order_status, payment_status, products(name, terms, warranty_fulfillment_type)')
      .eq('order_number', orderNumber)
      .eq('buyer_id', access.buyer.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const order = orders?.[0];
    if (orderError || !order) {
      return NextResponse.json({ error: 'Pesanan tidak ditemukan. Pastikan kode pesanan benar.' }, { status: 404 });
    }
    if (order.payment_status !== 'paid' || !['assigned', 'delivered', 'completed'].includes(order.order_status)) {
      return NextResponse.json({ error: 'Pesanan belum dibayar atau belum dikirim.' }, { status: 400 });
    }

    const product = Array.isArray(order.products) ? order.products[0] : order.products;
    if (!product) {
      return NextResponse.json({ error: 'Produk pesanan tidak ditemukan.' }, { status: 404 });
    }

    const isGeminiInvite = product.warranty_fulfillment_type === 'gemini_pro_invite';
    if (isGeminiInvite && !EMAIL_PATTERN.test(geminiInviteEmail)) {
      return NextResponse.json({ error: 'Email Google tujuan Gemini Pro tidak valid.' }, { status: 400 });
    }

    // Resolve the account from the authenticated buyer's assignment. Never trust
    // an account identifier typed by the browser or request account credentials.
    const { data: assignment, error: assignmentError } = await supabase
      .from('account_assignments')
      .select('id, stock_account_id, status, expired_at, warranty_expired_at, stock_accounts(id, account_identifier)')
      .eq('id', assignmentId)
      .eq('order_id', order.id)
      .eq('buyer_id', access.buyer.id)
      .in('status', ['active', 'replaced'])
      .maybeSingle();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: 'Akun pesanan yang dipilih tidak ditemukan.' }, { status: 404 });
    }
    if (assignment.warranty_expired_at && new Date(assignment.warranty_expired_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Masa garansi akun ini sudah berakhir.' }, { status: 400 });
    }

    const stockAccount = Array.isArray(assignment.stock_accounts)
      ? assignment.stock_accounts[0]
      : assignment.stock_accounts;
    const reportedEmail = stockAccount?.account_identifier?.trim();
    if (!reportedEmail) {
      return NextResponse.json({ error: 'Data akun pesanan tidak lengkap.' }, { status: 400 });
    }

    const { data: existingClaim } = await supabase
      .from('warranty_claims')
      .select('id, status')
      .eq('assignment_id', assignment.id)
      .limit(1)
      .maybeSingle();

    if (existingClaim) {
      if (['pending', 'approved', 'manual_review', 'no_backup'].includes(existingClaim.status)) {
        return NextResponse.json({ error: 'Klaim akun ini sedang diproses. Mohon tunggu.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Klaim garansi untuk akun ini sudah pernah diproses.' }, { status: 400 });
    }

    const termsSnapshot = product.terms?.trim() || 'Ketentuan garansi umum PastiPremium berlaku.';
    const claimCode = `WC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const resolutionNotes = isGeminiInvite
      ? 'Pengajuan diterima. Admin akan memeriksa klaim lalu mengirim invite Gemini Pro ke email Google tujuan.'
      : 'Pengajuan diterima dan menunggu peninjauan manual admin sesuai ketentuan garansi.';

    const { data: claim, error: claimInsertError } = await supabase.from('warranty_claims').insert({
      claim_code: claimCode,
      order_id: order.id,
      buyer_id: order.buyer_id,
      product_id: order.product_id,
      assignment_id: assignment.id,
      reported_email: reportedEmail,
      reported_password: '***hidden***',
      reason: issueType + (issueDescription ? ` - ${issueDescription}` : ''),
      issue_type: issueType,
      issue_description: issueDescription || null,
      terms_snapshot: termsSnapshot,
      terms_hash: crypto.createHash('sha256').update(termsSnapshot).digest('hex'),
      terms_accepted_at: new Date().toISOString(),
      gemini_invite_email: isGeminiInvite ? geminiInviteEmail : null,
      gemini_invite_status: isGeminiInvite ? 'ready_to_invite' : null,
      status: 'pending',
      replacement_backup_id: null,
      new_email: null,
      new_password_encrypted: null,
      resolution_notes: resolutionNotes,
      resolved_at: null,
    }).select('claim_code, status, resolution_notes').single();

    if (claimInsertError) {
      return NextResponse.json({ error: claimInsertError.message }, { status: 400 });
    }

    try {
      const message = `
<b>Pengajuan Garansi Baru</b>
Order: <code>${escapeTelegramHtml(orderNumber)}</code>
Akun: <code>${escapeTelegramHtml(reportedEmail)}</code>
Masalah: ${escapeTelegramHtml(issueType)}
${isGeminiInvite ? `Tujuan Invite Gemini: <code>${escapeTelegramHtml(geminiInviteEmail)}</code>` : ''}

Status: <b>Menunggu Peninjauan Admin</b>
      `.trim();
      await sendTelegramNotification(message);
    } catch (error) {
      console.error('Failed to send telegram notification', error);
    }

    return NextResponse.json(claim, { status: 201 });
  } catch (error: unknown) {
    console.error('Warranty claim error:', error);
    if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
      return NextResponse.json({ error: 'Request terlalu besar.' }, { status: 413 });
    }
    if (error instanceof Error && error.message === 'UNSUPPORTED_CONTENT_TYPE') {
      return NextResponse.json({ error: 'Content-Type harus application/json.' }, { status: 415 });
    }
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan sistem';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
