import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { code, product_id, buyer_id } = await request.json();

    if (!code || !product_id) {
      return NextResponse.json({ error: 'Kode diskon dan produk wajib diisi' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Find discount campaign by code
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

    // Check if campaign is for a specific product
    if (campaign.product_id && campaign.product_id !== product_id) {
      return NextResponse.json({ error: 'Kode diskon tidak berlaku untuk produk ini' }, { status: 400 });
    }

    // Check usage quota
    if (campaign.max_uses !== null && campaign.current_uses >= campaign.max_uses) {
      return NextResponse.json({ error: 'Kuota kode diskon sudah habis' }, { status: 400 });
    }

    // Check if buyer already used this code (1 code per buyer)
    if (buyer_id) {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('buyer_id', buyer_id)
        .eq('discount_campaign_id', campaign.id)
        .in('payment_status', ['paid', 'pending_payment'])
        .maybeSingle();

      if (existingOrder) {
        return NextResponse.json({ error: 'Kamu sudah pernah menggunakan kode diskon ini' }, { status: 400 });
      }
    }

    // Get product price to calculate the discount
    const { data: product } = await supabase
      .from('products')
      .select('price')
      .eq('id', product_id)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    // Check for active promo (sale price)
    const { data: promo } = await supabase
      .from('promos')
      .select('promo_price')
      .eq('product_id', product_id)
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now)
      .maybeSingle();

    const basePrice = promo ? Number(promo.promo_price) : Number(product.price);

    // Calculate discount amount
    let discountAmount = 0;
    if (campaign.discount_type === 'percentage') {
      discountAmount = Math.round(basePrice * Number(campaign.discount_value) / 100);
    } else {
      discountAmount = Number(campaign.discount_value);
    }

    // Don't let discount exceed the base price
    discountAmount = Math.min(discountAmount, basePrice);

    const finalPrice = basePrice - discountAmount;

    return NextResponse.json({
      valid: true,
      campaign_id: campaign.id,
      code: campaign.code,
      discount_type: campaign.discount_type,
      discount_value: campaign.discount_value,
      discount_amount: discountAmount,
      base_price: basePrice,
      final_price: finalPrice,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
