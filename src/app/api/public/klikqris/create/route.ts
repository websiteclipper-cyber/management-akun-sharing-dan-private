import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { createKlikQrisTransaction, KlikQrisTransaction } from '@/lib/klikqris';
import { findKlikQrisPayment, getStoredCreateData } from '@/lib/klikqris-payment';
import { BUYER_BAN_MESSAGE, isBuyerBannedStatus } from '@/lib/buyerBan';
import {
  isBuyerIdentityBanned,
  recordBannedBuyerIdentity,
} from '@/lib/buyerBanIdentity';

export const runtime = 'nodejs';

function toClientResponse(transaction: Record<string, unknown> | KlikQrisTransaction) {
  return {
    order_id: String(transaction.order_id || ''),
    amount: Number(transaction.amount || 0),
    total_amount: Number(transaction.total_amount || 0),
    status: String(transaction.status || 'PENDING'),
    qris_url: transaction.qris_url ? String(transaction.qris_url) : null,
    qris_image: transaction.qris_image ? String(transaction.qris_image) : null,
    expired_at: transaction.expired_at ? String(transaction.expired_at) : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderNumber = typeof body.order_number === 'string' ? body.order_number.trim() : '';
    if (!orderNumber) {
      return NextResponse.json({ error: 'order_number wajib diisi.' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, product_id, quantity, total_amount, payment_status, buyer:buyers(id, email, phone, status), product:products(name)')
      .eq('order_number', orderNumber)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order tidak ditemukan.' }, { status: 404 });
    }

    const buyerRelation = Array.isArray(order.buyer) ? order.buyer[0] : order.buyer;
    const buyerStatus = buyerRelation && typeof buyerRelation === 'object' && 'status' in buyerRelation
      ? String(buyerRelation.status || '')
      : '';
    const buyerId = buyerRelation && typeof buyerRelation === 'object' && 'id' in buyerRelation
      ? Number(buyerRelation.id)
      : 0;
    const buyerEmail = buyerRelation && typeof buyerRelation === 'object' && 'email' in buyerRelation
      ? buyerRelation.email
      : null;
    const buyerPhone = buyerRelation && typeof buyerRelation === 'object' && 'phone' in buyerRelation
      ? buyerRelation.phone
      : null;

    if (isBuyerBannedStatus(buyerStatus)) {
      if (buyerId) await recordBannedBuyerIdentity(buyerId, request, buyerEmail, buyerPhone);
      return NextResponse.json(
        { banned: true, error: BUYER_BAN_MESSAGE },
        { status: 403 },
      );
    }
    if (buyerStatus !== 'active') {
      return NextResponse.json({ error: 'Akun buyer tidak aktif.' }, { status: 403 });
    }
    if (await isBuyerIdentityBanned({ request, email: buyerEmail, phone: buyerPhone })) {
      return NextResponse.json(
        { banned: true, error: BUYER_BAN_MESSAGE },
        { status: 403 },
      );
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, status: 'SUCCESS', already_paid: true });
    }
    if (order.payment_status !== 'pending_payment') {
      return NextResponse.json(
        { error: `Order tidak dapat dibayar dari status ${order.payment_status}.` },
        { status: 409 },
      );
    }

    const existingPayment = await findKlikQrisPayment(order.id);
    if (existingPayment) {
      const createData = getStoredCreateData(existingPayment);
      if (existingPayment.status === 'pending' && createData) {
        return NextResponse.json({
          success: true,
          reused: true,
          payment: toClientResponse(createData),
        });
      }

      return NextResponse.json(
        { error: 'Transaksi QRIS untuk order ini sudah tidak aktif. Silakan buat pesanan baru.' },
        { status: 409 },
      );
    }

    const productRelation = Array.isArray(order.product) ? order.product[0] : order.product;
    const productName = productRelation && typeof productRelation === 'object' && 'name' in productRelation
      ? String(productRelation.name)
      : 'Produk digital';
    const amount = Number(order.total_amount);

    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Nominal order tidak valid.' }, { status: 400 });
    }

    const transaction = await createKlikQrisTransaction(
      order.order_number,
      amount,
      `Pembayaran ${productName} - ${order.order_number}`,
    );

    if (transaction.order_id !== order.order_number || Number(transaction.amount) !== amount) {
      console.error('KlikQRIS create response mismatch:', {
        expectedOrder: order.order_number,
        receivedOrder: transaction.order_id,
        expectedAmount: amount,
        receivedAmount: transaction.amount,
      });
      return NextResponse.json({ error: 'Respons KlikQRIS tidak cocok dengan order.' }, { status: 502 });
    }

    const totalAmount = Number(transaction.total_amount);
    if (!Number.isFinite(totalAmount) || totalAmount < amount) {
      return NextResponse.json({ error: 'Total pembayaran dari KlikQRIS tidak valid.' }, { status: 502 });
    }

    const now = new Date().toISOString();
    const storedCreateData = { ...transaction, qris_image: null };
    const { error: paymentError } = await supabase.from('payments').insert({
      order_id: order.id,
      gateway_name: 'klikqris',
      gateway_reference: `klikqris-${order.order_number}`,
      amount: totalAmount,
      status: 'pending',
      payload_raw: { create: storedCreateData },
      created_at: now,
      updated_at: now,
    });

    if (paymentError) {
      console.error('Failed to persist KlikQRIS transaction:', paymentError);
      return NextResponse.json(
        { error: 'Transaksi dibuat, tetapi gagal disimpan. Hubungi admin dengan nomor order Anda.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      reused: false,
      payment: toClientResponse(transaction),
    });
  } catch (error) {
    console.error('KlikQRIS create payment error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat transaksi KlikQRIS.' },
      { status: 500 },
    );
  }
}



