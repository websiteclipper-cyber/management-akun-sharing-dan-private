import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const { order_number, gateway_name, gateway_reference, amount, status } = await request.json();

    if (!order_number || !gateway_name) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    // Find order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', order_number)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order tidak ditemukan' }, { status: 404 });
    }

    // Idempotency check - already paid
    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, message: 'Payment already processed', idempotent: true });
    }

    // Only allow processing for pending payment orders
    if (order.payment_status !== 'pending_payment') {
      return NextResponse.json({ error: 'Order tidak bisa diproses (status: ' + order.payment_status + ')' }, { status: 400 });
    }

    if (status !== 'success') {
      // Mark payment as failed
      await supabase.from('payments').insert({
        order_id: order.id,
        gateway_name,
        gateway_reference: gateway_reference || null,
        amount: amount || order.total_amount,
        status: 'failed',
        payload_raw: { order_number, gateway_name, gateway_reference, amount, status },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await supabase
        .from('orders')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', order.id);

      return NextResponse.json({ success: false, error: 'Payment failed' });
    }

    // Idempotency check - duplicate gateway reference
    if (gateway_reference) {
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('*')
        .eq('gateway_reference', gateway_reference)
        .single();

      if (existingPayment) {
        return NextResponse.json({ success: true, message: 'Payment already recorded', idempotent: true });
      }
    }

    const now = new Date().toISOString();

    // Record payment
    await supabase.from('payments').insert({
      order_id: order.id,
      gateway_name,
      gateway_reference: gateway_reference || null,
      amount: amount || order.total_amount,
      status: 'success',
      payload_raw: { order_number, gateway_name, gateway_reference, amount, status },
      paid_at: now,
      created_at: now,
      updated_at: now,
    });

    // Update order status
    await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        order_status: 'paid',
        paid_at: now,
        payment_method: gateway_name,
        payment_reference: gateway_reference || null,
        updated_at: now,
      })
      .eq('id', order.id);

    // Trigger auto assignment
    const orderQuantity = order.quantity || 1;
    let assignSuccessCount = 0;
    
    for (let i = 0; i < orderQuantity; i++) {
      const { data: assignResult } = await supabase.rpc('assign_account_for_order', {
        p_order_id: order.id,
      });

      // If assignment succeeded, mark as delivered via web
      if (assignResult?.success && assignResult?.assignment_id) {
        assignSuccessCount++;
        await supabase
          .from('account_assignments')
          .update({ delivered_at: now, updated_at: now })
          .eq('id', assignResult.assignment_id);
      }
    }

    if (assignSuccessCount > 0) {
      const allAssigned = assignSuccessCount >= orderQuantity;
      await supabase
        .from('orders')
        .update({ order_status: allAssigned ? 'delivered' : 'assigned', delivered_at: allAssigned ? now : null, updated_at: now })
        .eq('id', order.id);
    }

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

              console.log(`💰 Commission recorded via callback: ${commissionAmount} for reseller ${reseller.name}`);
            }
          }
        }
      } catch (commErr) {
        console.error('Commission recording error in callback:', commErr);
        // Don't fail the callback — payment is already processed
      }
    }

    // Get product name for notification
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
      `💰 <b>PEMBAYARAN MASUK!</b>\n\n` +
      `<b>Order:</b> <code>${order_number}</code>\n` +
      `<b>Produk:</b> ${product?.name || '-'}` +
      qtyLabel +
      `\n<b>Nominal:</b> Rp ${Number(amount || order.total_amount).toLocaleString('id-ID')}\n` +
      `<b>Metode:</b> ${gateway_name}\n` +
      `<b>Waktu:</b> ${now}\n\n` +
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

    return NextResponse.json({
      success: true,
      message: 'Payment processed',
      assigned: assignSuccessCount > 0,
      assignment_count: assignSuccessCount,
      needs_manual: assignSuccessCount < orderQuantity,
    });
  } catch (err) {
    console.error('Payment callback error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
