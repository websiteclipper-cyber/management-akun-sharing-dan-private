import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { calculateCampaignDiscount, getMinimumQuantity } from '@/lib/discount-pricing';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function queryFeaturedCampaign() {
  const now = new Date().toISOString();
  const signal = AbortSignal.timeout(5_000);
  const { data: campaigns, error } = await supabase
    .from('discount_campaigns')
    .select('id, code, discount_type, discount_value, min_quantity, fixed_discount_mode, product_id, max_uses, current_uses, valid_from, valid_until, product:products(name, price, platform_name)')
    .eq('is_active', true)
    .lte('valid_from', now)
    .gte('valid_until', now)
    .not('product_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10)
    .abortSignal(signal);

  if (error) throw error;

  const campaign = campaigns?.find(item =>
    item.max_uses === null || Number(item.current_uses) < Number(item.max_uses));

  if (!campaign || !campaign.product) return { campaign: null };

  const product = campaign.product as unknown as {
    name: string;
    price: number;
    platform_name: string;
  };

  const { data: promo, error: promoError } = await supabase
    .from('promos')
    .select('promo_price')
    .eq('product_id', campaign.product_id)
    .eq('is_active', true)
    .lte('start_date', now)
    .gte('end_date', now)
    .abortSignal(signal)
    .maybeSingle();
  if (promoError) throw promoError;

  const minQuantity = getMinimumQuantity(campaign);
  const unitPrice = promo ? Number(promo.promo_price) : Number(product.price);
  const totalBasePrice = unitPrice * minQuantity;
  const calculation = calculateCampaignDiscount(campaign, totalBasePrice, minQuantity);

  return {
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
  };
}

const getFeaturedCampaign = unstable_cache(queryFeaturedCampaign, ['public-featured-campaign'], {
  revalidate: 30,
});

export async function GET() {
  try {
    return NextResponse.json(await getFeaturedCampaign());
  } catch {
    return NextResponse.json({ campaign: null }, { status: 200 });
  }
}
