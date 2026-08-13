import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';

interface OrderRow {
  id: number;
  order_number: string;
  product_id: number;
  reseller_id: string | null;
  total_amount: number | string;
  payment_status: string;
  quantity: number | null;
}

export interface StoredKlikQrisPayment {
  id: number;
  order_id: number;
  status: string;
  amount: number | string;
  payload_raw: Record<string, unknown> | null;
}

export interface KlikQrisConfirmation {
  orderNumber: string;
  amount: number;
  totalAmount: number;
  paidAt?: string | null;
  paymentMethod?: string;
  payload: Record<string, unknown>;
}

export function getStoredCreateData(payment: StoredKlikQrisPayment): Record<string, unknown> | null {
  const payload = payment.payload_raw;
  if (!payload || typeof payload !== 'object') return null;
  const create = payload.create;
  return create && typeof create === 'object' ? create as Record<string, unknown> : null;
}

export async function findKlikQrisPayment(orderId: number): Promise<StoredKlikQrisPayment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('id, order_id, status, amount, payload_raw')
    .eq('order_id', orderId)
    .eq('gateway_name', 'klikqris')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Gagal membaca transaksi KlikQRIS: ${error.message}`);
  return data as StoredKlikQrisPayment | null;
}

export async function completeKlikQrisPayment(confirmation: KlikQrisConfirmation) {
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('id, order_number, product_id, reseller_id, total_amount, payment_status, quantity')
    .eq('order_number', confirmation.orderNumber)
    .single();

  if (orderError || !orderData) throw new Error('Order tidak ditemukan.');
  const order = orderData as OrderRow;
  const expectedBaseAmount = Number(order.total_amount);

  if (confirmation.amount !== expectedBaseAmount) {
    throw new Error(`Nominal dasar tidak cocok: KlikQRIS=${confirmation.amount}, order=${expectedBaseAmount}.`);
  }

  const payment = await findKlikQrisPayment(order.id);
  if (!payment) throw new Error('Data transaksi awal KlikQRIS tidak ditemukan.');

  const createData = getStoredCreateData(payment);
  const expectedTotalAmount = Number(createData?.total_amount ?? payment.amount);
  if (!Number.isFinite(expectedTotalAmount) || confirmation.totalAmount !== expectedTotalAmount) {
    throw new Error(`Total pembayaran tidak cocok: KlikQRIS=${confirmation.totalAmount}, tersimpan=${expectedTotalAmount}.`);
  }

  if (!['pending_payment', 'paid'].includes(order.payment_status)) {
    throw new Error(`Order tidak dapat diproses dari status ${order.payment_status}.`);
  }

  const now = new Date().toISOString();
  const paidAt = confirmation.paidAt || now;
  const paymentMethod = confirmation.paymentMethod || 'QRIS';
  let newlyPaid = false;

  if (order.payment_status === 'pending_payment') {
    const { data: claimedOrder, error: claimError } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        order_status: 'paid',
        paid_at: paidAt,
        payment_method: `klikqris_${paymentMethod.toLowerCase()}`,
        payment_reference: `klikqris-${order.order_number}`,
        updated_at: now,
      })
      .eq('id', order.id)
      .eq('payment_status', 'pending_payment')
      .select('id')
      .maybeSingle();

    if (claimError) throw new Error(`Gagal memperbarui order: ${claimError.message}`);
    newlyPaid = Boolean(claimedOrder);

    if (!newlyPaid) {
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('payment_status')
        .eq('id', order.id)
        .single();
      if (currentOrder?.payment_status !== 'paid') {
        throw new Error('Order gagal diklaim untuk pemrosesan pembayaran.');
      }
    }
  }

  const { error: paymentError } = await supabase
    .from('payments')
    .update({
      amount: confirmation.totalAmount,
      status: 'success',
      payload_raw: {
        create: createData,
        confirmation: confirmation.payload,
      },
      paid_at: paidAt,
      updated_at: now,
    })
    .eq('id', payment.id);

  if (paymentError) throw new Error(`Gagal mencatat pembayaran: ${paymentError.message}`);

  const orderQuantity = Math.max(1, Number(order.quantity) || 1);
  const { data: existingAssignments, error: assignmentQueryError } = await supabase
    .from('account_assignments')
    .select('id')
    .eq('order_id', order.id)
    .eq('status', 'active');

  if (assignmentQueryError) {
    throw new Error(`Gagal membaca assignment: ${assignmentQueryError.message}`);
  }

  const assignmentIds = new Set<number>(
    (existingAssignments || []).map((assignment) => Number(assignment.id)),
  );
  let assignmentCreated = false;

  for (let index = assignmentIds.size; index < orderQuantity; index += 1) {
    try {
      const { data: assignResult } = await supabase.rpc('assign_account_for_order', {
        p_order_id: order.id,
      });

      if (!assignResult?.success || !assignResult?.assignment_id) break;
      assignmentIds.add(Number(assignResult.assignment_id));
      assignmentCreated = true;
    } catch (error) {
      console.error(`KlikQRIS auto-assign error (unit ${index + 1}/${orderQuantity}):`, error);
      break;
    }
  }

  if (assignmentIds.size > 0) {
    await supabase
      .from('account_assignments')
      .update({ delivered_at: now, updated_at: now })
      .in('id', [...assignmentIds]);
  }

  const allAssigned = assignmentIds.size >= orderQuantity;
  if (assignmentIds.size > 0) {
    await supabase
      .from('orders')
      .update({
        order_status: allAssigned ? 'delivered' : 'assigned',
        delivered_at: allAssigned ? now : null,
        updated_at: now,
      })
      .eq('id', order.id);
  }

  const assignmentId = assignmentIds.values().next().value ?? null;

  await ensureResellerCommission(order, now);

  if (newlyPaid) {
    const { data: product } = await supabase
      .from('products')
      .select('name, account_type')
      .eq('id', order.product_id)
      .single();

    const assignedLabel = allAssigned
      ? `Semua akun otomatis dikirim (${assignmentIds.size}/${orderQuantity}).`
      : assignmentIds.size > 0
        ? `Sebagian akun terkirim (${assignmentIds.size}/${orderQuantity}); sisanya perlu assignment manual.`
        : 'Perlu assign akun manual.';
    sendTelegramNotification(
      `💰 <b>PEMBAYARAN MASUK VIA KLIKQRIS!</b>\n\n` +
      `<b>Order:</b> <code>${order.order_number}</code>\n` +
      `<b>Produk:</b> ${product?.name || '-'}\n` +
      `<b>Nominal:</b> Rp ${confirmation.totalAmount.toLocaleString('id-ID')}\n` +
      `<b>Metode:</b> ${paymentMethod}\n` +
      `<b>Waktu:</b> ${paidAt}\n\n${assignedLabel}`,
    );

    if (assignmentCreated) await notifyLowStock(order.product_id, product);
  }

  return {
    success: true,
    newlyPaid,
    assigned: allAssigned,
    assignedCount: assignmentIds.size,
    assignmentId,
  };
}

async function ensureResellerCommission(order: OrderRow, now: string) {
  if (!order.reseller_id) return;

  try {
    const { data: existingCommission } = await supabase
      .from('reseller_commissions')
      .select('id')
      .eq('order_id', order.id)
      .maybeSingle();
    if (existingCommission) return;

    const { data: reseller } = await supabase
      .from('resellers')
      .select('*')
      .eq('id', order.reseller_id)
      .single();
    if (!reseller) return;

    const { data: productCommission } = await supabase
      .from('reseller_product_commissions')
      .select('*')
      .eq('reseller_id', reseller.id)
      .eq('product_id', order.product_id)
      .maybeSingle();

    const commissionType = productCommission?.commission_type
      || reseller.default_commission_type
      || 'fixed';
    const commissionRate = Number(
      productCommission?.commission_value ?? reseller.default_commission_value ?? 0,
    );
    const orderAmount = Number(order.total_amount);
    const commissionAmount = commissionType === 'percentage'
      ? Math.round(orderAmount * commissionRate / 100)
      : commissionRate;
    if (commissionAmount <= 0) return;

    const { data: product } = await supabase
      .from('products')
      .select('name')
      .eq('id', order.product_id)
      .single();

    const { error: insertError } = await supabase.from('reseller_commissions').insert({
      reseller_id: reseller.id,
      order_id: order.id,
      product_id: order.product_id,
      product_name: product?.name || '',
      order_amount: orderAmount,
      commission_type: commissionType,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      status: 'unpaid',
    });
    if (insertError) throw insertError;

    await supabase.from('resellers').update({
      total_sales: Number(reseller.total_sales || 0) + 1,
      total_commission: Number(reseller.total_commission || 0) + commissionAmount,
      unpaid_commission: Number(reseller.unpaid_commission || 0) + commissionAmount,
      updated_at: now,
    }).eq('id', reseller.id);
  } catch (error) {
    console.error('KlikQRIS commission error:', error);
  }
}

async function notifyLowStock(productId: number, product: { name?: string; account_type?: string } | null) {
  try {
    const { count } = await supabase
      .from('stock_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('status', 'active');

    if (count !== null && count <= 1) {
      const typeLabel = product?.account_type === 'sharing' ? 'Sharing' : 'Private';
      sendTelegramNotification(
        `⚠️ <b>PERINGATAN STOK MENIPIS!</b>\n\n` +
        `<b>Produk:</b> ${product?.name || '-'}\n` +
        `<b>Tipe:</b> ${typeLabel}\n` +
        `<b>Sisa Stok:</b> ${count === 0 ? 'HABIS! (0)' : 'tinggal 1'}\n\n` +
        'Mohon segera tambahkan stok baru untuk produk ini.',
      );
    }
  } catch (error) {
    console.error('KlikQRIS stock check error:', error);
  }
}

