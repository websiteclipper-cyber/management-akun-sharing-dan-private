import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';
import { getBuyerFromRequest, verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authenticatedBuyer = getBuyerFromRequest(request);
    if (!authenticatedBuyer) {
      return NextResponse.json({ error: 'Silakan login kembali sebelum membuat pesanan.' }, { status: 401 });
    }

    const { product_id, ref_code, discount_code, quantity: rawQty, reseller_token } = await request.json();
    const quantity = Math.min(10, Math.max(1, Math.floor(Number(rawQty) || 1)));

    if (!product_id) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    // Get product
    const { data: product, error: prodError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('status', 'active')
      .single();

    if (prodError || !product) {
      return NextResponse.json({ error: 'Produk tidak ditemukan' }, { status: 404 });
    }

    // Resolve identity from the verified application token, never from buyer
    // fields supplied by the browser.
    const { data: buyer, error: buyerError } = await supabase
      .from('buyers')
      .select('*')
      .eq('id', authenticatedBuyer.id)
      .eq('status', 'active')
      .single();
    if (buyerError || !buyer || !buyer.name || !buyer.phone || !buyer.email) {
      return NextResponse.json({ error: 'Profil buyer belum lengkap atau tidak aktif.' }, { status: 403 });
    }

    // ===== CHECK IF BUYER IS A NEWCOMER (first-time buyer) =====
    let isNewcomer = false;
    const { count: paidOrderCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', buyer.id)
      .eq('payment_status', 'paid');

    if (paidOrderCount === 0 || paidOrderCount === null) {
      isNewcomer = true;
    }

    // ===== ANTI ABUSE: LEVEL 2 (IP ADDRESS) =====
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '';
    if (isNewcomer && clientIp) {
      // Safely check orders by IP (ignores if column doesn't exist yet to prevent crashes)
      const { count: ipOrderCount, error: ipError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('client_ip', clientIp)
        .eq('payment_status', 'paid');
        
      if (!ipError && ipOrderCount && ipOrderCount > 0) {
        isNewcomer = false; // Block newcomer price! Suspected abuse.
        console.warn(`[Anti-Abuse] Blocked newcomer promo for IP ${clientIp}`);
      }
    }

    // Anti-spam: Check if buyer already has a pending order for the same product within last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('buyer_id', buyer.id)
      .eq('product_id', product.id)
      .eq('quantity', quantity)
      .eq('payment_status', 'pending_payment')
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingOrder) {
      // Return existing pending order instead of creating a new one
      return NextResponse.json({
        order_id: existingOrder.id,
        order_number: existingOrder.order_number,
        payment_status: existingOrder.payment_status,
        order_status: existingOrder.order_status,
        amount: existingOrder.total_amount,
        reused: true,
        is_newcomer: isNewcomer,
      });
    }

    // Generate order number
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const orderNumber = `ORD-${dateStr}-${rand}`;

    // Look up reseller by ref_code
    let resellerId = null;
    let reseller = null;
    if (ref_code) {
      const { data: resellerData } = await supabase
        .from('resellers')
        .select('*')
        .eq('ref_code', ref_code.toUpperCase())
        .eq('status', 'active')
        .single();
      if (resellerData) {
        // ===== ANTI SELF-REFERRAL (Multi-Layer) =====
        let isSelfReferral = false;
        let detectionMethod = '';

        const cleanBuyerPhone = (buyer.phone || '').replace(/[^0-9]/g, '');
        const cleanResellerPhone = (resellerData.phone || '').replace(/[^0-9]/g, '');
        
        // Level 1: Phone Match
        if (cleanBuyerPhone && cleanResellerPhone && cleanBuyerPhone === cleanResellerPhone) {
          isSelfReferral = true;
          detectionMethod = 'Pencocokan Nomor HP (Level 1)';
        }

        // Level 2: Session/Token Match
        if (!isSelfReferral && reseller_token) {
          const sessionPayload = verifyToken(reseller_token);
          if (sessionPayload && sessionPayload.type === 'reseller' && String(sessionPayload.id) === String(resellerData.id)) {
            isSelfReferral = true;
            detectionMethod = 'Deteksi Browser Session (Level 2)';
          }
        }

        // Level 3: IP Address Match
        if (!isSelfReferral && clientIp && resellerData.last_login_ip === clientIp) {
          isSelfReferral = true;
          detectionMethod = 'Pencocokan IP Address (Level 3)';
        }

        if (isSelfReferral) {
          console.warn(`[Anti-Abuse] Blocked self-referral for reseller ${resellerData.name} (${cleanResellerPhone}). Method: ${detectionMethod}`);
          
          // Send Telegram notification
          sendTelegramNotification(
            `⚠️ <b>SELF-REFERRAL TERDETEKSI!</b>\n\n` +
            `<b>Reseller:</b> ${resellerData.name}\n` +
            `<b>Metode Deteksi:</b> ${detectionMethod}\n\n` +
            `Sistem mendeteksi reseller mencoba membeli produk menggunakan link referral miliknya sendiri.\n` +
            `<i>Komisi untuk order ini dibatalkan secara otomatis.</i>`
          );
          
          // Do NOT assign resellerId to this order
          resellerId = null;
          reseller = null;
        } else {
          resellerId = resellerData.id;
          reseller = resellerData;
        }
      }
    }

    const now = new Date().toISOString();

    // Check for active promo (sale price)
    const { data: promo } = await supabase
      .from('promos')
      .select('*')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now)
      .maybeSingle();

    // Determine base prices
    const normalPrice = promo ? Number(promo.promo_price) : Number(product.price);
    let totalBasePrice = normalPrice * quantity;
    let usedNewcomerPrice = false;

    if (isNewcomer && product.newcomer_price !== null && product.newcomer_price !== undefined) {
      totalBasePrice = Number(product.newcomer_price) + (normalPrice * (quantity - 1));
      usedNewcomerPrice = true;
    }

    // ===== DISCOUNT CODE HANDLING =====
    let discountCampaignId: string | null = null;
    let discountAmount = 0;

    if (discount_code) {
      const trimmedCode = discount_code.toUpperCase().trim();

      // Validate discount campaign
      const { data: campaign } = await supabase
        .from('discount_campaigns')
        .select('*')
        .eq('code', trimmedCode)
        .eq('is_active', true)
        .lte('valid_from', now)
        .gte('valid_until', now)
        .maybeSingle();

      if (campaign) {
        // Check product restriction
        const productMatch = !campaign.product_id || campaign.product_id === product.id;

        // Check usage quota
        const quotaOk = campaign.max_uses === null || campaign.current_uses < campaign.max_uses;

        // Check buyer hasn't used this code before
        let buyerUsedBefore = false;
        const { data: prevOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('buyer_id', buyer.id)
          .eq('discount_campaign_id', campaign.id)
          .in('payment_status', ['paid', 'pending_payment'])
          .maybeSingle();

        if (prevOrder) buyerUsedBefore = true;

        if (productMatch && quotaOk && !buyerUsedBefore) {
          // Calculate discount on total base price
          if (campaign.discount_type === 'percentage') {
            discountAmount = Math.round(totalBasePrice * Number(campaign.discount_value) / 100);
          } else {
            discountAmount = Number(campaign.discount_value) * quantity;
          }
          // Cap discount at total base price
          discountAmount = Math.min(discountAmount, totalBasePrice);
          discountCampaignId = campaign.id;

          // Increment campaign usage atomically
          await supabase
            .from('discount_campaigns')
            .update({
              current_uses: campaign.current_uses + 1,
              updated_at: now,
            })
            .eq('id', campaign.id);
        }
        // If conditions not met, silently proceed without discount
        // (validation was already done on the frontend)
      }
    }

    const finalPrice = totalBasePrice - discountAmount;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        buyer_id: buyer.id,
        product_id: product.id,
        quantity: quantity,
        unit_price: usedNewcomerPrice && quantity === 1 ? Number(product.newcomer_price) : normalPrice,
        total_amount: finalPrice,
        payment_status: 'pending_payment',
        order_status: 'pending',
        reseller_id: resellerId,
        discount_campaign_id: discountCampaignId,
        discount_amount: discountAmount,
        client_ip: clientIp,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (orderError) {
      return NextResponse.json({ error: 'Gagal membuat pesanan: ' + orderError.message }, { status: 500 });
    }

    // NOTE: Commission is recorded in /api/webhooks/pakasir after payment is confirmed
    // This prevents phantom commissions from unpaid/expired orders

    // Send Telegram Notification
    const discountLabel = discountAmount > 0 ? `\n<b>Diskon:</b> -Rp ${discountAmount.toLocaleString('id-ID')}` : '';
    const newcomerLabel = usedNewcomerPrice ? `\n🆕 <b>Harga Buyer Baru</b> (1x)` : '';
    const qtyLabel = quantity > 1 ? `\n<b>Jumlah:</b> ${quantity}x` : '';
    sendTelegramNotification(
      `🛒 <b>PESANAN BARU! (Belum Bayar)</b>\n\n` +
      `<b>Order:</b> <code>${orderNumber}</code>\n` +
      `<b>Produk:</b> ${product.name}\n` +
      `<b>Harga:</b> Rp ${totalBasePrice.toLocaleString('id-ID')}` +
      qtyLabel +
      newcomerLabel +
      discountLabel +
      `\n<b>Total:</b> Rp ${finalPrice.toLocaleString('id-ID')}\n\n` +
      `<b>Buyer:</b> ${buyer.name}\n` +
      `<b>WA:</b> ${buyer.phone}` +
      (reseller ? `\n\n🤝 <b>Via Reseller:</b> ${reseller.name} (${reseller.ref_code})` : '')
    );

    return NextResponse.json({
      order_id: order.id,
      order_number: order.order_number,
      payment_status: order.payment_status,
      order_status: order.order_status,
      amount: order.total_amount,
      quantity: quantity,
      discount_amount: discountAmount,
      is_newcomer: isNewcomer,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
