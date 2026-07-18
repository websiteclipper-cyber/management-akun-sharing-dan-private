import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';
import { getPakasirTransaction } from '@/lib/pakasir';
import { sendTelegramNotification } from '@/lib/telegram';

// Manual sync: check all pending orders against Pakasir and update if paid
export async function POST(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Get all orders still marked as pending_payment
    const { data: pendingOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('payment_status', 'pending_payment')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      return NextResponse.json({ success: true, message: 'No pending orders to sync', synced: 0 });
    }

    const results: Array<{ order_number: string; status: string; synced: boolean; error?: string }> = [];

    for (const order of pendingOrders) {
      try {
        // Check status from Pakasir API
        const detail = await getPakasirTransaction(order.order_number, order.total_amount);

        if (detail?.transaction?.status === 'completed') {
          const now = new Date().toISOString();
          const completedAt = detail.transaction.completed_at || now;
          const paymentMethod = detail.transaction.payment_method || 'qris';

          // Record payment
          const { data: existingPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('order_id', order.id)
            .eq('status', 'success')
            .maybeSingle();

          if (!existingPayment) {
            await supabase.from('payments').insert({
              order_id: order.id,
              gateway_name: 'pakasir',
              gateway_reference: `pakasir-${order.order_number}-${paymentMethod}-sync`,
              amount: order.total_amount,
              status: 'success',
              payload_raw: detail.transaction,
              paid_at: completedAt,
              created_at: now,
              updated_at: now,
            });
          }

          // Update order status
          await supabase
            .from('orders')
            .update({
              payment_status: 'paid',
              order_status: 'paid',
              paid_at: completedAt,
              payment_method: `pakasir_${paymentMethod}`,
              payment_reference: `pakasir-${order.order_number}-sync`,
              updated_at: now,
            })
            .eq('id', order.id);

          // Assign account
          try {
            const orderQuantity = order.quantity || 1;
            let assignSuccessCount = 0;
            
            for (let i = 0; i < orderQuantity; i++) {
              const { data: assignResult } = await supabase.rpc('assign_account_for_order', {
                p_order_id: order.id,
              });

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
          } catch (assignErr) {
            console.error('Auto-assign error during sync:', assignErr);
          }

          // Record reseller commission if applicable
          if (order.reseller_id) {
            try {
              const { data: reseller } = await supabase
                .from('resellers')
                .select('*')
                .eq('id', order.reseller_id)
                .single();

              if (reseller) {
                const { data: productCommission } = await supabase
                  .from('reseller_product_commissions')
                  .select('*')
                  .eq('reseller_id', reseller.id)
                  .eq('product_id', order.product_id)
                  .maybeSingle();

                const commType = productCommission?.commission_type || reseller.default_commission_type || 'fixed';
                const commRate = productCommission?.commission_value ?? (reseller.default_commission_value || 0);
                const orderAmount = Number(order.total_amount);
                const commAmount = commType === 'percentage'
                  ? Math.round(orderAmount * commRate / 100)
                  : commRate;

                if (commAmount > 0) {
                  const { data: existingComm } = await supabase
                    .from('reseller_commissions')
                    .select('id')
                    .eq('order_id', order.id)
                    .maybeSingle();

                  if (!existingComm) {
                    const { data: prod } = await supabase
                      .from('products')
                      .select('name')
                      .eq('id', order.product_id)
                      .single();

                    await supabase.from('reseller_commissions').insert({
                      reseller_id: reseller.id,
                      order_id: order.id,
                      product_id: order.product_id,
                      product_name: prod?.name || '',
                      order_amount: orderAmount,
                      commission_type: commType,
                      commission_rate: commRate,
                      commission_amount: commAmount,
                      status: 'unpaid',
                    });

                    await supabase.from('resellers').update({
                      total_sales: (reseller.total_sales || 0) + 1,
                      total_commission: (reseller.total_commission || 0) + commAmount,
                      unpaid_commission: (reseller.unpaid_commission || 0) + commAmount,
                      updated_at: now,
                    }).eq('id', reseller.id);
                  }
                }
              }
            } catch (commErr) {
              console.error('Commission sync error:', commErr);
            }
          }

          // Send Telegram notification for synced payment
          const { data: syncProd } = await supabase
            .from('products')
            .select('name')
            .eq('id', order.product_id)
            .single();

          sendTelegramNotification(
            `💰 <b>PEMBAYARAN MASUK (SYNC)!</b>\n\n` +
            `<b>Order:</b> <code>${order.order_number}</code>\n` +
            `<b>Produk:</b> ${syncProd?.name || '-'}\n` +
            `<b>Nominal:</b> Rp ${Number(order.total_amount).toLocaleString('id-ID')}\n` +
            `<b>Metode:</b> pakasir_${paymentMethod}\n` +
            `<b>Waktu Bayar:</b> ${completedAt}`
          );

          results.push({ order_number: order.order_number, status: 'synced', synced: true });
        } else {
          results.push({
            order_number: order.order_number,
            status: detail?.transaction?.status || 'unknown',
            synced: false,
          });
        }
      } catch (err) {
        results.push({
          order_number: order.order_number,
          status: 'error',
          synced: false,
          error: (err as Error).message,
        });
      }
    }

    const syncedCount = results.filter(r => r.synced).length;

    return NextResponse.json({
      success: true,
      message: `Synced ${syncedCount} of ${pendingOrders.length} pending orders`,
      synced: syncedCount,
      total_pending: pendingOrders.length,
      details: results,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
