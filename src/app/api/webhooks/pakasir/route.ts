import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';

// Pakasir Webhook Handler
// Pakasir will POST to this endpoint when payment is completed
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { amount, order_id, project, status, payment_method, completed_at } = payload;

    console.log('📥 Pakasir Webhook received:', JSON.stringify(payload));

    // Validate required fields
    if (!order_id || !amount || !status) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    // Validate project slug
    if (project !== (process.env.PAKASIR_SLUG || 'pastipremiumid1')) {
      console.error('Invalid project slug:', project);
      return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
    }

    // Find order by order_number (pakasir order_id = our order_number)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', order_id)
      .single();

    if (orderError || !order) {
      console.error('Order not found for webhook:', order_id);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Idempotency: already paid
    if (order.payment_status === 'paid') {
      console.log('Order already paid, skipping:', order_id);
      return NextResponse.json({ success: true, message: 'Already processed' });
    }

    // Validate amount matches
    if (Number(amount) !== Number(order.total_amount)) {
      console.error(`Amount mismatch: webhook=${amount}, order=${order.total_amount}`);
      // Still process but log warning
    }

    if (status !== 'completed') {
      console.log('Non-completed webhook status:', status);
      return NextResponse.json({ success: true, message: 'Status noted' });
    }

    const now = new Date().toISOString();

    // Record payment in payments table
    await supabase.from('payments').insert({
      order_id: order.id,
      gateway_name: 'pakasir',
      gateway_reference: `pakasir-${order_id}-${payment_method}`,
      amount: amount || order.total_amount,
      status: 'success',
      payload_raw: payload,
      paid_at: completed_at || now,
      created_at: now,
      updated_at: now,
    });

    // Update order status to paid
    await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        order_status: 'paid',
        paid_at: completed_at || now,
        payment_method: `pakasir_${payment_method || 'qris'}`,
        payment_reference: `pakasir-${order_id}`,
        updated_at: now,
      })
      .eq('id', order.id);

    // Record reseller commission (only after confirmed payment)
    if (order.reseller_id) {
      try {
        const { data: reseller } = await supabase
          .from('resellers')
          .select('*')
          .eq('id', order.reseller_id)
          .single();

        if (reseller) {
          // Check for product-specific commission
          const { data: productCommission } = await supabase
            .from('reseller_product_commissions')
            .select('*')
            .eq('reseller_id', reseller.id)
            .eq('product_id', order.product_id)
            .maybeSingle();

          const commissionType = productCommission?.commission_type || reseller.default_commission_type || 'fixed';
          const commissionRate = productCommission?.commission_value ?? (reseller.default_commission_value || 0);

          const orderAmount = Number(order.total_amount);
          let commissionAmount = 0;
          if (commissionType === 'percentage') {
            commissionAmount = Math.round(orderAmount * commissionRate / 100);
          } else {
            commissionAmount = commissionRate;
          }

          if (commissionAmount > 0) {
            // Check idempotency: don't record commission twice for same order
            const { data: existingComm } = await supabase
              .from('reseller_commissions')
              .select('id')
              .eq('order_id', order.id)
              .maybeSingle();

            if (!existingComm) {
              // Get product name for the commission record
              const { data: prod } = await supabase
                .from('products')
                .select('name')
                .eq('id', order.product_id)
                .single();

              // Insert commission record
              await supabase.from('reseller_commissions').insert({
                reseller_id: reseller.id,
                order_id: order.id,
                product_id: order.product_id,
                product_name: prod?.name || '',
                order_amount: orderAmount,
                commission_type: commissionType,
                commission_rate: commissionRate,
                commission_amount: commissionAmount,
                status: 'unpaid',
              });

              // Update reseller stats
              await supabase.from('resellers').update({
                total_sales: (reseller.total_sales || 0) + 1,
                total_commission: (reseller.total_commission || 0) + commissionAmount,
                unpaid_commission: (reseller.unpaid_commission || 0) + commissionAmount,
                updated_at: now,
              }).eq('id', reseller.id);

              console.log(`💰 Commission recorded: ${commissionAmount} for reseller ${reseller.name}`);
            }
          }
        }
      } catch (commErr) {
        console.error('Commission recording error:', commErr);
        // Don't fail the webhook — payment is already processed
      }
    }

    // Auto-assign account(s) to buyer — loop for quantity
    const orderQuantity = order.quantity || 1;
    let assignSuccessCount = 0;
    let assignFailCount = 0;
    let lastAssignResult = null;

    for (let i = 0; i < orderQuantity; i++) {
      try {
        const { data } = await supabase.rpc('assign_account_for_order', {
          p_order_id: order.id,
        });
        lastAssignResult = data;

        if (data?.success && data?.assignment_id) {
          assignSuccessCount++;
          await supabase
            .from('account_assignments')
            .update({ delivered_at: now, updated_at: now })
            .eq('id', data.assignment_id);
        } else {
          assignFailCount++;
        }
      } catch (assignErr) {
        console.error(`Auto-assign error (unit ${i + 1}/${orderQuantity}):`, assignErr);
        assignFailCount++;
      }
    }

    // Update order status based on assignment results
    if (assignSuccessCount > 0) {
      const allAssigned = assignSuccessCount >= orderQuantity;
      await supabase
        .from('orders')
        .update({
          order_status: allAssigned ? 'delivered' : 'assigned',
          delivered_at: allAssigned ? now : null,
          updated_at: now,
        })
        .eq('id', order.id);
    }

    // Get product name and type for notification
    const { data: product } = await supabase
      .from('products')
      .select('name, account_type')
      .eq('id', order.product_id)
      .single();

    // Send Telegram Notification for payment
    const qtyLabel = orderQuantity > 1 ? `\n<b>Jumlah:</b> ${orderQuantity}x` : '';
    const assigned = assignSuccessCount >= orderQuantity
      ? '✅ Akun otomatis dikirim!'
      : assignSuccessCount > 0
        ? `⚠️ Sebagian terkirim (${assignSuccessCount}/${orderQuantity}), perlu assign manual sisanya`
        : '⚠️ Perlu assign akun manual';
    sendTelegramNotification(
      `💰 <b>PEMBAYARAN MASUK VIA PAKASIR!</b>\n\n` +
      `<b>Order:</b> <code>${order_id}</code>\n` +
      `<b>Produk:</b> ${product?.name || '-'}` +
      qtyLabel +
      `\n<b>Nominal:</b> Rp ${Number(amount).toLocaleString('id-ID')}\n` +
      `<b>Metode:</b> ${payment_method || 'QRIS'}\n` +
      `<b>Waktu:</b> ${completed_at || now}\n\n` +
      `${assigned}`
    );

    // Check remaining stock if assignment was successful
    if (assignSuccessCount > 0) {
      try {
        const { count: remainingStock } = await supabase
          .from('stock_accounts')
          .select('*', { count: 'exact', head: true })
          .eq('product_id', order.product_id)
          .eq('status', 'active');

        // Notify if stock is running low (1 or 0)
        if (remainingStock !== null && remainingStock <= 1) {
          const typeLabel = product?.account_type === 'sharing' ? 'Sharing' : 'Private';
          const stockWarning = remainingStock === 0 ? 'HABIS! (0)' : 'tinggal 1';
          
          sendTelegramNotification(
            `⚠️ <b>PERINGATAN STOK MENIPIS!</b>\n\n` +
            `<b>Produk:</b> ${product?.name}\n` +
            `<b>Tipe:</b> ${typeLabel}\n` +
            `<b>Sisa Stok:</b> ${stockWarning}\n\n` +
            `Mohon segera tambahkan stok baru untuk produk ini.`
          );
        }
      } catch (stockErr) {
        console.error('Error checking remaining stock:', stockErr);
      }
    }

    return NextResponse.json({ success: true, message: 'Payment processed' });
  } catch (err) {
    console.error('Pakasir webhook error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
