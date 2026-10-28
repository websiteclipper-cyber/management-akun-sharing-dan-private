import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { verifyKiPayWebhook } from '@/lib/kipay';
import { syncKiPayPayment } from '@/lib/kipay-payment';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.KIPAY_WEBHOOK_SECRET?.trim()) {
      return NextResponse.json({ error: 'Webhook belum dikonfigurasi.' }, { status: 503 });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'Content-Type harus application/json.' }, { status: 415 });
    }
    const maxBytes = 64 * 1024;
    if (Number(request.headers.get('content-length')) > maxBytes) {
      return NextResponse.json({ error: 'Payload terlalu besar.' }, { status: 413 });
    }
    const chunks: Uint8Array[] = [];
    const reader = request.body?.getReader();
    let size = 0;
    if (!reader) return NextResponse.json({ error: 'Payload kosong.' }, { status: 400 });
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return NextResponse.json({ error: 'Payload terlalu besar.' }, { status: 413 });
      }
      chunks.push(value);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    if (!verifyKiPayWebhook(rawBody, request.headers)) {
      return NextResponse.json({ error: 'Signature tidak valid.' }, { status: 401 });
    }
    const payload = JSON.parse(rawBody);
    if (!payload || typeof payload !== 'object' || typeof payload.event !== 'string'
      || payload.event !== request.headers.get('x-webhook-event')) {
      return NextResponse.json({ error: 'Event tidak valid.' }, { status: 400 });
    }
    if (payload.event === 'webhook.test') return NextResponse.json({ success: true });
    if (!['transaction.paid', 'transaction.expired'].includes(payload.event)) {
      return NextResponse.json({ success: true, ignored: true });
    }
    const transactionId = payload.transaction?.trx_id;
    if (typeof transactionId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(transactionId)) {
      return NextResponse.json({ error: 'ID transaksi tidak valid.' }, { status: 400 });
    }
    const { data: payment, error } = await supabase.from('payments')
      .select('id, order_id, status, amount, payload_raw, gateway_reference')
      .eq('gateway_name', 'kipay').eq('gateway_reference', transactionId).maybeSingle();
    // The webhook can race the initial insert; returning 503 requests a retry.
    if (error || !payment) return NextResponse.json({ error: 'Transaksi belum tersedia.' }, { status: 503 });
    const { data: order, error: orderError } = await supabase.from('orders')
      .select('order_number').eq('id', payment.order_id).single();
    if (orderError || !order) throw new Error('Order tidak ditemukan.');
    const result = await syncKiPayPayment(payment, order.order_number);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON tidak valid.' }, { status: 400 });
    // Do not echo payloads or upstream errors into responses or logs.
    console.error('KiPay webhook processing failed.');
    return NextResponse.json({ error: 'Pembayaran belum dapat diproses. Silakan kirim ulang.' }, { status: 503 });
  }
}
