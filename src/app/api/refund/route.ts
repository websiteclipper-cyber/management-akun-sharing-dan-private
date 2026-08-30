import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

const ELIGIBLE_ORDER_STATUSES = new Set(['paid', 'assigned', 'delivered', 'completed']);
const EWALLET_PROVIDERS = new Set(['dana', 'gopay']);

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

function createRequestCode() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `RF-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderNumber = normalizeOrderNumber(body.order_number);
    const ewalletProvider = normalizeText(body.ewallet_provider, 20).toLowerCase();
    const ewalletNumber = normalizeText(body.ewallet_number, 20).replace(/\D/g, '');
    const accountHolderName = normalizeText(body.account_holder_name, 100).replace(/\s+/g, ' ');

    if (!orderNumber || !EWALLET_PROVIDERS.has(ewalletProvider)) {
      return NextResponse.json({ error: 'ID pesanan dan tujuan refund wajib diisi.' }, { status: 400 });
    }
    if (!/^[0-9]{9,15}$/.test(ewalletNumber)) {
      return NextResponse.json({ error: 'Nomor e-wallet harus terdiri dari 9–15 digit.' }, { status: 400 });
    }
    if (accountHolderName.length < 2) {
      return NextResponse.json({ error: 'Nama pemilik e-wallet belum valid.' }, { status: 400 });
    }

    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('id, buyer_id, total_amount, payment_status, order_status, created_at')
      .eq('order_number', orderNumber)
      .order('created_at', { ascending: false })
      .limit(1);
    const order = orders?.[0];

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pesanan tidak ditemukan. Periksa kembali ID pesanan.' }, { status: 404 });
    }
    if (order.payment_status !== 'paid' || !ELIGIBLE_ORDER_STATUSES.has(order.order_status)) {
      return NextResponse.json({ error: 'Pesanan ini belum memenuhi syarat untuk pengajuan refund.' }, { status: 400 });
    }

    const { data: existingRequest, error: existingError } = await supabase
      .from('refund_requests')
      .select('request_code, status')
      .eq('order_id', order.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: 'Gagal memeriksa pengajuan refund.' }, { status: 500 });
    }
    if (existingRequest) {
      return NextResponse.json({ error: `Refund untuk pesanan ini sudah pernah diajukan (${existingRequest.request_code}).` }, { status: 409 });
    }

    const { data: refundRequest, error: insertError } = await supabase
      .from('refund_requests')
      .insert({
        request_code: createRequestCode(),
        order_id: order.id,
        buyer_id: order.buyer_id,
        refund_amount: Number(order.total_amount || 0),
        ewallet_provider: ewalletProvider,
        ewallet_number: ewalletNumber,
        account_holder_name: accountHolderName,
        status: 'pending',
      })
      .select('request_code, status, created_at')
      .single();

    if (insertError) {
      const status = insertError.code === '23505' ? 409 : 400;
      const error = status === 409 ? 'Refund untuk pesanan ini sudah pernah diajukan.' : 'Pengajuan refund belum dapat disimpan.';
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({ ...refundRequest, estimated_days: '3–7 hari' }, { status: 201 });
  } catch (error) {
    console.error('Refund request error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan saat memproses refund.' }, { status: 500 });
  }
}
