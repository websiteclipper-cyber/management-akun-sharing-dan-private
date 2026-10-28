import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { createKiPayTransaction, getKiPayConfig, getKiPayQrImage } from '@/lib/kipay';
import { findKiPayPayment, kiPayCreateData } from '@/lib/kipay-payment';
import { getStoredCreateData } from '@/lib/klikqris-payment';

interface CheckoutOrder {
  id: number;
  order_number: string;
  total_amount: number | string;
}

export async function createOrLoadKiPayPayment(order: CheckoutOrder) {
  getKiPayConfig(); // Validate before claiming an order.
  let payment = await findKiPayPayment(order.id);
  if (!payment) {
    const amount = Number(order.total_amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Nominal order tidak valid.' }, { status: 400 });
    }
    // A database compare-and-set serializes requests across tabs and server instances.
    // Do not automatically release an ambiguous POST: KiPay does not document an idempotency key.
    const { data: claimed, error: claimError } = await supabase.from('orders')
      .update({ payment_reference: 'kipay-creating', updated_at: new Date().toISOString() })
      .eq('id', order.id).eq('payment_status', 'pending_payment').is('payment_reference', null)
      .select('id').maybeSingle();
    if (claimError) throw new Error('Gagal menyiapkan pembayaran KiPay.');
    if (!claimed) {
      payment = await findKiPayPayment(order.id);
      if (!payment) return NextResponse.json({
        error: 'Pembayaran sedang disiapkan atau perlu diperiksa admin. Muat ulang sebentar lagi; jangan buat pembayaran ganda.',
      }, { status: 409 });
    } else {
      const transaction = await createKiPayTransaction(order.order_number, amount);
      const now = new Date().toISOString();
      const { data: stored, error } = await supabase.from('payments').insert({
        order_id: order.id, gateway_name: 'kipay', gateway_reference: transaction.trx_id,
        amount: transaction.amount, status: 'pending',
        payload_raw: { create: kiPayCreateData(transaction) }, created_at: now, updated_at: now,
      }).select('id, order_id, status, amount, payload_raw, gateway_reference').single();
      if (error || !stored) throw new Error('Transaksi KiPay dibuat tetapi gagal disimpan. Hubungi admin dengan nomor pesanan Anda.');
      payment = stored;
      const { error: referenceError } = await supabase.from('orders').update({ payment_reference: transaction.trx_id, updated_at: now })
        .eq('id', order.id).eq('payment_reference', 'kipay-creating');
      if (referenceError) throw new Error('Transaksi tersimpan. Muat ulang untuk membuka pembayaran.');
    }
  }
  if (!payment) throw new Error('Data pembayaran KiPay tidak ditemukan.');
  const create = getStoredCreateData(payment);
  if (!create?.trx_id) throw new Error('Data transaksi KiPay tidak lengkap. Hubungi admin.');
  if (create.note !== order.order_number || Number(create.requested_amount) !== Number(order.total_amount)
    || payment.gateway_reference !== create.trx_id || Number(create.total_amount) !== Number(payment.amount)) {
    throw new Error('Data pembayaran KiPay tidak cocok dengan pesanan. Hubungi admin.');
  }
  if (payment.status === 'failed') return NextResponse.json({ success: true, status: 'EXPIRED' });
  // Fetch PNG server-to-server. Never return the provider's credential-bearing qr_url.
  const image = await getKiPayQrImage(String(create.trx_id));
  return NextResponse.json({
    success: true,
    payment: {
      gateway: 'kipay', order_id: order.order_number, amount: Number(create.requested_amount),
      total_amount: Number(payment.amount), status: 'PENDING',
      qris_url: null, qris_image: image, expired_at: create.expires_at,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
