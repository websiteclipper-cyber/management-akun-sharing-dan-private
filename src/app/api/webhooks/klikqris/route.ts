import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { normalizeKlikQrisWebhook, signaturesMatch } from '@/lib/klikqris';
import {
  completeKlikQrisPayment,
  findKlikQrisPayment,
  getStoredCreateData,
} from '@/lib/klikqris-payment';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const webhook = normalizeKlikQrisWebhook(payload);

    if (!webhook) {
      return NextResponse.json({ error: 'Payload webhook tidak valid.' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, payment_status')
      .eq('order_number', webhook.orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order tidak ditemukan.' }, { status: 404 });
    }

    const payment = await findKlikQrisPayment(order.id);
    const createData = payment ? getStoredCreateData(payment) : null;
    const expectedSignature = String(createData?.signature || '');

    if (!payment || !signaturesMatch(expectedSignature, webhook.signature)) {
      console.error('KlikQRIS webhook signature mismatch for order:', webhook.orderId);
      return NextResponse.json({ error: 'Signature tidak valid.' }, { status: 401 });
    }

    if (webhook.status === 'EXPIRED') {
      const now = new Date().toISOString();
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          payload_raw: { create: createData, confirmation: webhook.raw },
          updated_at: now,
        })
        .eq('id', payment.id)
        .eq('status', 'pending');

      await supabase
        .from('orders')
        .update({ payment_status: 'failed', updated_at: now })
        .eq('id', order.id)
        .eq('payment_status', 'pending_payment');

      return NextResponse.json({ success: true, message: 'Expired transaction recorded.' });
    }

    if (!['PAID', 'SUCCESS'].includes(webhook.status)) {
      return NextResponse.json({ success: true, message: 'Status ignored.' });
    }

    const result = await completeKlikQrisPayment({
      orderNumber: webhook.orderId,
      amount: webhook.amount,
      totalAmount: webhook.totalAmount,
      paidAt: webhook.paidAt,
      paymentMethod: webhook.paymentMethod,
      payload: webhook.raw,
    });

    return NextResponse.json({
      success: true,
      message: result.newlyPaid ? 'Payment processed.' : 'Payment already processed.',
      assigned: result.assigned,
    });
  } catch (error) {
    console.error('KlikQRIS webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error.' },
      { status: 500 },
    );
  }
}

