import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getKlikQrisTransaction, signaturesMatch } from '@/lib/klikqris';
import {
  completeKlikQrisPayment,
  findKlikQrisPayment,
  getStoredCreateData,
} from '@/lib/klikqris-payment';

export const runtime = 'nodejs';

// Buyer-facing fallback when a KlikQRIS webhook is delayed or missed.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderNumber = typeof body.order_number === 'string' ? body.order_number.trim() : '';
    if (!orderNumber) {
      return NextResponse.json({ error: 'order_number wajib diisi.' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, payment_status')
      .eq('order_number', orderNumber)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order tidak ditemukan.' }, { status: 404 });
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, status: 'paid', already_paid: true });
    }

    const payment = await findKlikQrisPayment(order.id);
    if (!payment) {
      return NextResponse.json({ success: true, status: 'pending', synced: false });
    }

    const createData = getStoredCreateData(payment);
    const detail = await getKlikQrisTransaction(order.order_number);
    const expectedSignature = String(createData?.signature || '');

    if (!detail.signature || !signaturesMatch(expectedSignature, detail.signature)) {
      throw new Error('Signature status KlikQRIS tidak cocok dengan transaksi awal.');
    }

    if (detail.status === 'SUCCESS') {
      const result = await completeKlikQrisPayment({
        orderNumber: order.order_number,
        amount: Number(detail.amount),
        totalAmount: Number(detail.total_amount),
        paidAt: detail.paid_at,
        paymentMethod: 'QRIS',
        payload: detail as unknown as Record<string, unknown>,
      });

      return NextResponse.json({
        success: true,
        status: 'paid',
        synced: result.newlyPaid,
        assigned: result.assigned,
      });
    }

    if (detail.status === 'EXPIRED') {
      const now = new Date().toISOString();
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          payload_raw: { create: createData, confirmation: detail },
          updated_at: now,
        })
        .eq('id', payment.id)
        .eq('status', 'pending');

      await supabase
        .from('orders')
        .update({ payment_status: 'failed', updated_at: now })
        .eq('id', order.id)
        .eq('payment_status', 'pending_payment');

      return NextResponse.json({ success: true, status: 'expired', synced: false });
    }

    return NextResponse.json({ success: true, status: 'pending', synced: false });
  } catch (error) {
    console.error('KlikQRIS payment check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal mengecek pembayaran KlikQRIS.' },
      { status: 502 },
    );
  }
}
