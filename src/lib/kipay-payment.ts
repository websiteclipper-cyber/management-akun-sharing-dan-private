import { supabaseAdmin as supabase } from '@/lib/supabase';
import { completeGatewayPayment, findGatewayPayment, getStoredCreateData, StoredKlikQrisPayment } from '@/lib/klikqris-payment';
import { getKiPayTransaction, KiPayTransaction } from '@/lib/kipay';

export function kiPayCreateData(transaction: KiPayTransaction) {
  return { ...transaction, total_amount: transaction.amount };
}

export async function syncKiPayPayment(payment: StoredKlikQrisPayment, orderNumber: string) {
  const create = getStoredCreateData(payment);
  const transactionId = String(create?.trx_id || '');
  if (!transactionId || payment.gateway_reference !== transactionId) throw new Error('Referensi KiPay tidak ditemukan.');
  // Always retrieve authoritative data, including for signed webhooks.
  const detail = await getKiPayTransaction(transactionId);
  if (detail.note !== orderNumber || detail.requested_amount !== Number(create?.requested_amount)
    || detail.amount !== Number(payment.amount) || detail.mode !== create?.mode) {
    throw new Error('Nominal atau referensi transaksi KiPay tidak sesuai.');
  }
  if (detail.status === 'paid') {
    const completed = await completeGatewayPayment({
      gatewayName: 'kipay', gatewayReference: transactionId,
      orderNumber, amount: detail.requested_amount, totalAmount: detail.amount,
      paymentMethod: 'QRIS', payload: { ...detail },
    });
    return { status: 'paid', synced: completed.newlyPaid, assigned: completed.assigned };
  }
  if (detail.status === 'expired') {
    const now = new Date().toISOString();
    const { error: paymentError } = await supabase.from('payments').update({
      status: 'failed', payload_raw: { create, confirmation: detail }, updated_at: now,
    }).eq('id', payment.id).eq('status', 'pending');
    if (paymentError) throw new Error('Gagal mencatat kedaluwarsa pembayaran KiPay.');
    const { error: orderError } = await supabase.from('orders').update({
      payment_status: 'failed', updated_at: now,
    }).eq('id', payment.order_id).eq('payment_status', 'pending_payment');
    if (orderError) throw new Error('Gagal memperbarui status order.');
    return { status: 'expired', synced: false };
  }
  return { status: 'pending', synced: false };
}

export async function findKiPayPayment(orderId: number) {
  return findGatewayPayment(orderId, 'kipay');
}
