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
      .select('price, newcomer_price')
      .eq('id', product_id)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    // Check if buyer is a newcomer (no paid orders)
    let isNewcomer = false;
    if (buyer_id) {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', buyer_id)
        .eq('payment_status', 'paid');
      isNewcomer = count === 0 || count === null;
    }

    // ===== ANTI ABUSE: LEVEL 2 (IP ADDRESS) =====
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';
    if (isNewcomer && clientIp) {
      const { count: ipOrderCount, error: ipError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_ip', clientIp)
        .eq('payment_status', 'paid');
        
      if (!ipError && ipOrderCount && ipOrderCount > 0) {
        isNewcomer = false; 
      }
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

    // Determine base price: newcomer_price > promo > regular
    let basePrice: number;
    if (isNewcomer && product.newcomer_price !== null && product.newcomer_price !== undefined) {
      basePrice = Number(product.newcomer_price);
    } else {
      basePrice = promo ? Number(promo.promo_price) : Number(product.price);
    }

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
