import { NextRequest, NextResponse } from 'next/server';
import { getBuyerFromRequest } from '@/lib/auth';
import {
  calculateCampaignDiscount,
  getMinimumQuantity,
  normalizeOrderQuantity,
} from '@/lib/discount-pricing';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const authenticatedBuyer = getBuyerFromRequest(request);
    if (!authenticatedBuyer) {
      return NextResponse.json({ error: 'Silakan login kembali sebelum memakai kode promo.' }, { status: 401 });
    }

    const { code, product_id, quantity: rawQuantity } = await request.json();
    const quantity = normalizeOrderQuantity(rawQuantity);

    if (!code || !product_id) {
      return NextResponse.json({ error: 'Kode diskon dan produk wajib diisi' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: campaign, error } = await supabase
      .from('discount_campaigns')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .eq('is_active', true)
      .lte('valid_from', now)
      .gte('valid_until', now)
      .maybeSingle();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Kode diskon tidak valid atau sudah kadaluarsa' }, { status: 404 });
    }

    if (campaign.product_id && campaign.product_id !== product_id) {
      return NextResponse.json({ error: 'Kode diskon tidak berlaku untuk produk ini' }, { status: 400 });
    }

    const minQuantity = getMinimumQuantity(campaign);
    if (quantity < minQuantity) {
      return NextResponse.json({
        error: `Kode promo ini berlaku minimal pembelian ${minQuantity} item`,
        min_quantity: minQuantity,
      }, { status: 400 });
    }

    if (campaign.max_uses !== null && Number(campaign.current_uses) >= Number(campaign.max_uses)) {
      return NextResponse.json({ error: 'Kuota kode diskon sudah habis' }, { status: 400 });
    }

    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, order_number, payment_status')
      .eq('buyer_id', authenticatedBuyer.id)
      .eq('discount_campaign_id', campaign.id)
      .in('payment_status', ['paid', 'pending_payment'])
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      const message = existingOrder.payment_status === 'pending_payment'
        ? `Kode ini sedang dipakai pada pesanan ${existingOrder.order_number}`
        : 'Kamu sudah pernah menggunakan kode diskon ini';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { data: product } = await supabase
      .from('products')
      .select('price, newcomer_price')
      .eq('id', product_id)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    let isNewcomer = false;
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', authenticatedBuyer.id)
      .eq('payment_status', 'paid');
    isNewcomer = count === 0 || count === null;

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || '';
    if (isNewcomer && clientIp) {
      const { count: ipOrderCount, error: ipError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_ip', clientIp)
        .eq('payment_status', 'paid');

      if (!ipError && ipOrderCount && ipOrderCount > 0) isNewcomer = false;
    }

    const { data: promo } = await supabase
      .from('promos')
      .select('promo_price')
      .eq('product_id', product_id)
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now)
      .maybeSingle();

    const normalPrice = promo ? Number(promo.promo_price) : Number(product.price);
    let totalBasePrice = normalPrice * quantity;
    if (isNewcomer && product.newcomer_price !== null && product.newcomer_price !== undefined) {
      totalBasePrice = Number(product.newcomer_price) + normalPrice * (quantity - 1);
    }

    const calculation = calculateCampaignDiscount(campaign, totalBasePrice, quantity);

    return NextResponse.json({
      valid: true,
      campaign_id: campaign.id,
      code: campaign.code,
      discount_type: campaign.discount_type,
      discount_value: Number(campaign.discount_value),
      discount_amount: calculation.discountAmount,
      base_price: totalBasePrice,
      total_base_price: totalBasePrice,
      final_price: calculation.finalPrice,
      quantity,
      min_quantity: calculation.minQuantity,
      fixed_discount_mode: calculation.fixedDiscountMode,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
