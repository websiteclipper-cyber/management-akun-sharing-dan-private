import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.vercel') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if(!supabaseUrl) console.log("Missing supabase url");

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orders, error } = await supabase.from('orders').select('*, product:products(*), reseller:resellers(*)').eq('payment_status', 'paid').neq('order_status', 'delivered');
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(orders, null, 2));

    // Also let's automatically record commission if it is missing
    for (const order of orders) {
      if (order.reseller_id) {
         console.log('Checking commission for order:', order.id);
         const { data: existingComm } = await supabase
            .from('reseller_commissions')
            .select('id')
            .eq('order_id', order.id)
            .maybeSingle();
         
         if (!existingComm && order.reseller) {
            console.log("Missing commission detected. Manual recording...");
            const reseller = order.reseller;
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
              await supabase.from('reseller_commissions').insert({
                  reseller_id: reseller.id,
                  order_id: order.id,
                  product_id: order.product_id,
                  product_name: order.product?.name || '',
                  order_amount: orderAmount,
                  commission_type: commissionType,
                  commission_rate: commissionRate,
                  commission_amount: commissionAmount,
                  status: 'unpaid',
              });

              await supabase.from('resellers').update({
                  total_sales: (reseller.total_sales || 0) + 1,
                  total_commission: (reseller.total_commission || 0) + commissionAmount,
                  unpaid_commission: (reseller.unpaid_commission || 0) + commissionAmount,
                  updated_at: new Date().toISOString(),
              }).eq('id', reseller.id);
              console.log(`✅ Commission recorded: ${commissionAmount}`);
            }
         } else {
            console.log("Commission already exists or no reseller.");
         }
      }
    }
  }
}
run();
