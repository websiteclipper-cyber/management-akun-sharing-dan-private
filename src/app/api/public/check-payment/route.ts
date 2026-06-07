import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getPakasirTransaction } from '@/lib/pakasir';

// Public endpoint for buyer-facing pages to check and sync a single order
// This is a fallback when the webhook from Pakasir fails
export async function POST(request: NextRequest) {
  try {
    const { order_number } = await request.json();

    if (!order_number) {
      return NextResponse.json({ error: 'Missing order_number' }, { status: 400 });
    }

    // Find the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_number', order_number)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // If already paid, just return current status
    if (order.payment_status === 'paid') {
      return NextResponse.json({ success: true, status: 'paid', already_paid: true });
    }

    // Check status from Pakasir API
    try {
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
            gateway_reference: `pakasir-${order.order_number}-${paymentMethod}-check`,
            amount: order.total_amount,
            status: 'success',
            payload_raw: detail.transaction,
            paid_at: completedAt,
            created_at: now,
            updated_at: now,
          });
        }

        // Update order
        await supabase
          .from('orders')
          .update({
            payment_status: 'paid',
            order_status: 'paid',
            paid_at: completedAt,
            payment_method: `pakasir_${paymentMethod}`,
            payment_reference: `pakasir-${order.order_number}-check`,
            updated_at: now,
          })
          .eq('id', order.id);

        // Auto-assign account(s)
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
          console.error('Auto-assign error during check-payment:', assignErr);
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
            console.error('Commission error during check-payment:', commErr);
          }
        }

        return NextResponse.json({ success: true, status: 'paid', synced: true });
      }

      // Not yet completed in Pakasir
      return NextResponse.json({
        success: true,
        status: detail?.transaction?.status || 'pending',
        synced: false,
      });
    } catch (pakasirErr) {
      console.error('Pakasir check error:', pakasirErr);
      return NextResponse.json({
        success: true,
        status: 'pending',
        synced: false,
        pakasir_error: (pakasirErr as Error).message,
      });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
