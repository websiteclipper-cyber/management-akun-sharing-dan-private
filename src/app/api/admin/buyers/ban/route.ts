import { NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';
import { buildBuyerBanIdentifiers } from '@/lib/buyerBanIdentity';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const buyerId = Number(body.buyerId);
    const banned = body.banned;
    if (!Number.isSafeInteger(buyerId) || buyerId <= 0 || typeof banned !== 'boolean') {
      return NextResponse.json({ error: 'Data ban buyer tidak valid.' }, { status: 400 });
    }

    const { data: buyer, error: buyerError } = await supabaseAdmin
      .from('buyers')
      .select('id, name, email, phone, status')
      .eq('id', buyerId)
      .maybeSingle();
    if (buyerError || !buyer) {
      return NextResponse.json({ error: 'Buyer tidak ditemukan.' }, { status: 404 });
    }

    const ips: unknown[] = [];
    if (banned) {
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data: orders, error: ordersError } = await supabaseAdmin
          .from('orders')
          .select('client_ip')
          .eq('buyer_id', buyerId)
          .not('client_ip', 'is', null)
          .range(from, from + pageSize - 1);
        if (ordersError) {
          return NextResponse.json({ error: 'Gagal membaca riwayat IP buyer.' }, { status: 500 });
        }
        ips.push(...(orders || []).map((order) => order.client_ip));
        if ((orders || []).length < pageSize) break;
      }
    }

    const identifiers = banned
      ? buildBuyerBanIdentifiers({ email: buyer.email, phone: buyer.phone, ips })
      : [];
    const { data: result, error: banError } = await supabaseAdmin.rpc('set_buyer_ban', {
      p_buyer_id: buyerId,
      p_banned: banned,
      p_identifiers: identifiers,
    });
    if (banError) {
      console.error('Failed to set buyer ban:', banError.message);
      return NextResponse.json({ error: 'Gagal mengubah status ban buyer.' }, { status: 500 });
    }

    const counts = identifiers.reduce<Record<string, number>>((acc, identifier) => {
      acc[identifier.type] = (acc[identifier.type] || 0) + 1;
      return acc;
    }, {});
    const status = banned ? 'blocked' : 'active';
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      admin_id: admin.id,
      actor_type: 'admin',
      action: banned ? 'ban_buyer' : 'unban_buyer',
      entity_type: 'buyer',
      entity_id: buyerId,
      before_data: { status: buyer.status },
      after_data: { status, identifier_counts: counts },
    });
    if (auditError) console.error('Failed to write buyer ban audit log:', auditError.message);

    return NextResponse.json({
      success: true,
      status,
      identifiers: counts,
      data: result,
    });
  } catch (error) {
    console.error('Buyer ban endpoint error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan saat memproses ban buyer.' }, { status: 500 });
  }
}

