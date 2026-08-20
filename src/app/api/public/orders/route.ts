import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';
import { getBuyerAccessFromRequest, verifyToken } from '@/lib/auth';
import { BUYER_BAN_MESSAGE, isBuyerBannedStatus } from '@/lib/buyerBan';
import {
  calculateCampaignDiscount,
  getMinimumQuantity,
  normalizeOrderQuantity,
} from '@/lib/discount-pricing';

export async function POST(request: NextRequest) {
  try {
    const buyerAccess = await getBuyerAccessFromRequest(request);
    if (!buyerAccess) {
      return NextResponse.json({ error: 'Silakan login kembali sebelum membuat pesanan.' }, { status: 401 });
    }
    if (isBuyerBannedStatus(buyerAccess.status)) {
      return NextResponse.json(
        { banned: true, error: BUYER_BAN_MESSAGE },
        { status: 403 },
      );
    }
    if (buyerAccess.status !== 'active') {
      return NextResponse.json({ error: 'Akun buyer tidak aktif.' }, { status: 403 });
    }

    const buyer = buyerAccess.buyer;
    const { product_id, ref_code, discount_code, quantity: rawQty, reseller_token } = await request.json();
    const quantity = normalizeOrderQuantity(rawQty);

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

    if (!buyer.name || !buyer.phone || !buyer.email) {
      return NextResponse.json({ error: 'Profil buyer belum lengkap.' }, { status: 403 });
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

    // Generate order number. A cryptographically random 8-hex suffix (4 billion
    // values per day) replaces the old Math.random()*10000 (only 10k/day), whose
    // same-day collisions could make a valid order code fail to look up.
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
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
    let campaignToClaim: { id: string; currentUses: number } | null = null;

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

      if (!campaign) {
        return NextResponse.json({ error: 'Kode diskon tidak valid atau sudah kadaluarsa' }, { status: 400 });
      }

      if (campaign.product_id && campaign.product_id !== product.id) {
        return NextResponse.json({ error: 'Kode diskon tidak berlaku untuk produk ini' }, { status: 400 });
      }

      const minQuantity = getMinimumQuantity(campaign);
      if (quantity < minQuantity) {
        return NextResponse.json({
          error: `Kode promo ini berlaku minimal pembelian ${minQuantity} item`,
        }, { status: 400 });
      }

      if (campaign.max_uses !== null && Number(campaign.current_uses) >= Number(campaign.max_uses)) {
        return NextResponse.json({ error: 'Kuota kode diskon sudah habis' }, { status: 400 });
      }

      const { data: previousCampaignOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('buyer_id', buyer.id)
        .eq('discount_campaign_id', campaign.id)
        .in('payment_status', ['paid', 'pending_payment'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (previousCampaignOrder) {
        if (
          previousCampaignOrder.payment_status === 'pending_payment'
          && previousCampaignOrder.product_id === product.id
          && Number(previousCampaignOrder.quantity || 1) === quantity
        ) {
          return NextResponse.json({
            order_id: previousCampaignOrder.id,
            order_number: previousCampaignOrder.order_number,
            payment_status: previousCampaignOrder.payment_status,
            order_status: previousCampaignOrder.order_status,
            amount: previousCampaignOrder.total_amount,
            quantity,
            discount_amount: previousCampaignOrder.discount_amount,
            reused: true,
            is_newcomer: isNewcomer,
          });
        }

        const message = previousCampaignOrder.payment_status === 'pending_payment'
          ? `Kode ini sedang dipakai pada pesanan ${previousCampaignOrder.order_number}`
          : 'Kamu sudah pernah menggunakan kode diskon ini';
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const calculation = calculateCampaignDiscount(campaign, totalBasePrice, quantity);
      discountAmount = calculation.discountAmount;
      discountCampaignId = campaign.id;
      campaignToClaim = { id: campaign.id, currentUses: Number(campaign.current_uses) };
    }

    const finalPrice = totalBasePrice - discountAmount;

    // Reuse only an order with exactly the same price and discount. This keeps
    // an older full-price pending order from overriding a newly applied promo.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    let existingOrderQuery = supabase
      .from('orders')
      .select('*')
      .eq('buyer_id', buyer.id)
      .eq('product_id', product.id)
      .eq('quantity', quantity)
      .eq('total_amount', finalPrice)
      .eq('payment_status', 'pending_payment')
      .gte('created_at', tenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1);

    existingOrderQuery = discountCampaignId
      ? existingOrderQuery.eq('discount_campaign_id', discountCampaignId)
      : existingOrderQuery.is('discount_campaign_id', null);

    const { data: matchingPendingOrders } = await existingOrderQuery;
    const existingOrder = matchingPendingOrders?.[0];
    if (existingOrder) {
      return NextResponse.json({
        order_id: existingOrder.id,
        order_number: existingOrder.order_number,
        payment_status: existingOrder.payment_status,
        order_status: existingOrder.order_status,
        amount: existingOrder.total_amount,
        quantity,
        discount_amount: existingOrder.discount_amount,
        reused: true,
        is_newcomer: isNewcomer,
      });
    }

    // Conditional update prevents two simultaneous checkouts from consuming
    // the last promo quota at the same time.
    if (campaignToClaim) {
      const { data: claimedCampaign, error: claimError } = await supabase
        .from('discount_campaigns')
        .update({
          current_uses: campaignToClaim.currentUses + 1,
          updated_at: now,
        })
        .eq('id', campaignToClaim.id)
        .eq('current_uses', campaignToClaim.currentUses)
        .select('id')
        .maybeSingle();

      if (claimError || !claimedCampaign) {
        return NextResponse.json({
          error: 'Kuota kode promo baru saja habis. Silakan coba kode lain.',
        }, { status: 409 });
      }
    }

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
      if (campaignToClaim) {
        await supabase
          .from('discount_campaigns')
          .update({
            current_uses: campaignToClaim.currentUses,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignToClaim.id)
          .eq('current_uses', campaignToClaim.currentUses + 1);
      }
      return NextResponse.json({ error: 'Gagal membuat pesanan: ' + orderError.message }, { status: 500 });
    }

    // Commission is recorded only after a signed KlikQRIS payment confirmation.
    // This prevents phantom commissions from unpaid or expired orders.

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
