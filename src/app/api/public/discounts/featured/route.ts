import { NextResponse } from 'next/server';
import { calculateCampaignDiscount, getMinimumQuantity } from '@/lib/discount-pricing';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date().toISOString();
    const { data: campaigns, error } = await supabase
      .from('discount_campaigns')
      .select('id, code, discount_type, discount_value, min_quantity, fixed_discount_mode, product_id, max_uses, current_uses, valid_from, valid_until, product:products(name, price, platform_name)')
      .eq('is_active', true)
      .lte('valid_from', now)
      .gte('valid_until', now)
      .not('product_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ campaign: null }, { status: 200 });
    }

    const campaign = campaigns?.find(item =>
      item.max_uses === null || Number(item.current_uses) < Number(item.max_uses));

    if (!campaign || !campaign.product) {
      return NextResponse.json({ campaign: null });
    }

    const product = campaign.product as unknown as {
      name: string;
      price: number;
      platform_name: string;
    };

    const { data: promo } = await supabase
      .from('promos')
      .select('promo_price')
      .eq('product_id', campaign.product_id)
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now)
      .maybeSingle();

    const minQuantity = getMinimumQuantity(campaign);
    const unitPrice = promo ? Number(promo.promo_price) : Number(product.price);
    const totalBasePrice = unitPrice * minQuantity;
    const calculation = calculateCampaignDiscount(campaign, totalBasePrice, minQuantity);

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        code: campaign.code,
        discount_type: campaign.discount_type,
        discount_value: Number(campaign.discount_value),
        min_quantity: minQuantity,
        fixed_discount_mode: calculation.fixedDiscountMode,
        valid_from: campaign.valid_from,
        valid_until: campaign.valid_until,
        product,
        original_price: totalBasePrice,
        final_price: calculation.finalPrice,
        discount_amount: calculation.discountAmount,
      },
    });
  } catch {
    return NextResponse.json({ campaign: null }, { status: 200 });
  }
}
