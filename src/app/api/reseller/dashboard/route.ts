import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getResellerFromRequest } from '@/lib/auth';

export async function GET(request: Request) {
  const reseller = getResellerFromRequest(request);
  if (!reseller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get reseller stats
    const { data: resellerData } = await supabase
      .from('resellers')
      .select('*')
      .eq('id', reseller.id)
      .single();

    if (!resellerData) {
      return NextResponse.json({ error: 'Reseller not found' }, { status: 404 });
    }

    // Get commissions with order details
    const { data: commissions } = await supabase
      .from('reseller_commissions')
      .select('*, order:orders(order_number, total_amount, buyer:buyers(name))')
      .eq('reseller_id', reseller.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Get monthly stats (current month)
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: monthlyCommissions } = await supabase
      .from('reseller_commissions')
      .select('commission_amount, created_at')
      .eq('reseller_id', reseller.id)
      .gte('created_at', firstOfMonth);

    const monthlySales = monthlyCommissions?.length || 0;
    const monthlyEarnings = monthlyCommissions?.reduce((sum, c) => sum + (c.commission_amount || 0), 0) || 0;

    // Get product-specific commissions for this reseller
    const { data: productCommissions } = await supabase
      .from('reseller_product_commissions')
      .select('*, product:products(name, price)')
      .eq('reseller_id', reseller.id);

    return NextResponse.json({
      success: true,
      reseller: {
        id: resellerData.id,
        name: resellerData.name,
        ref_code: resellerData.ref_code,
        phone: resellerData.phone,
        status: resellerData.status,
        total_sales: resellerData.total_sales || 0,
        total_commission: resellerData.total_commission || 0,
        unpaid_commission: resellerData.unpaid_commission || 0,
        default_commission_type: resellerData.default_commission_type || 'fixed',
        default_commission_value: resellerData.default_commission_value || 0,
      },
      commissions: commissions || [],
      monthly: {
        sales: monthlySales,
        earnings: monthlyEarnings,
      },
      productCommissions: productCommissions || [],
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
