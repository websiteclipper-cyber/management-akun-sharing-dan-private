import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';
import { getKlikQrisTransaction, signaturesMatch } from '@/lib/klikqris';
import {
  completeKlikQrisPayment,
  findKlikQrisPayment,
  getStoredCreateData,
} from '@/lib/klikqris-payment';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { data: pendingOrders, error } = await supabase
      .from('orders')
      .select('id, order_number, payment_status')
      .eq('payment_status', 'pending_payment')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!pendingOrders?.length) {
      return NextResponse.json({ success: true, message: 'Tidak ada order pending.', synced: 0, details: [] });
    }

    const results: Array<{ order_number: string; status: string; synced: boolean; error?: string }> = [];

    for (const order of pendingOrders) {
      try {
        const payment = await findKlikQrisPayment(order.id);
        if (!payment) {
          results.push({ order_number: order.order_number, status: 'belum ada transaksi QRIS', synced: false });
          continue;
        }

        const createData = getStoredCreateData(payment);
        const detail = await getKlikQrisTransaction(order.order_number);
        const expectedSignature = String(createData?.signature || '');
        if (!detail.signature || !signaturesMatch(expectedSignature, detail.signature)) {
          throw new Error('Signature status tidak cocok.');
        }

        if (detail.status === 'SUCCESS') {
          const completed = await completeKlikQrisPayment({
            orderNumber: order.order_number,
            amount: Number(detail.amount),
            totalAmount: Number(detail.total_amount),
            paidAt: detail.paid_at,
            paymentMethod: 'QRIS',
            payload: detail as unknown as Record<string, unknown>,
          });
          results.push({
            order_number: order.order_number,
            status: completed.newlyPaid ? 'paid' : 'sudah diproses',
            synced: completed.newlyPaid,
          });
          continue;
        }

        if (detail.status === 'EXPIRED') {
          const now = new Date().toISOString();
          await supabase.from('payments').update({
            status: 'failed',
            payload_raw: { create: createData, confirmation: detail },
            updated_at: now,
          }).eq('id', payment.id).eq('status', 'pending');
          await supabase.from('orders').update({
            payment_status: 'failed',
            updated_at: now,
          }).eq('id', order.id).eq('payment_status', 'pending_payment');
          results.push({ order_number: order.order_number, status: 'expired', synced: false });
          continue;
        }

        results.push({ order_number: order.order_number, status: 'pending', synced: false });
      } catch (syncError) {
        results.push({
          order_number: order.order_number,
          status: 'error',
          synced: false,
          error: syncError instanceof Error ? syncError.message : 'Unknown error',
        });
      }
    }

    const synced = results.filter((item) => item.synced).length;
    return NextResponse.json({
      success: true,
      message: `Berhasil menyinkronkan ${synced} dari ${pendingOrders.length} order pending.`,
      synced,
      total_pending: pendingOrders.length,
      details: results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menyinkronkan KlikQRIS.' },
      { status: 500 },
    );
  }
}

