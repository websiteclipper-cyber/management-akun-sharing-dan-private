import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';

export async function POST(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSuperAdmin(admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { productId, commissionType, commissionValue } = await request.json();

    if (!productId || !commissionType) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Ambil daftar id semua reseller yang aktif
    const { data: activeResellers, error: err1 } = await supabaseAdmin
      .from('resellers')
      .select('id')
      .eq('status', 'active');
    
    if (err1) throw err1;

    // Siapkan array data untuk bulk upsert
    const upserts = activeResellers.map(r => ({
      reseller_id: r.id,
      product_id: productId,
      commission_type: commissionType,
      commission_value: commissionValue,
    }));

    // Lakukan upsert ke reseller_product_commissions
    // Kita anggap ada constraint unique pada reseller_id + product_id
    const { data, error } = await supabaseAdmin
      .from('reseller_product_commissions')
      .upsert(upserts, { onConflict: 'reseller_id, product_id' })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, count: data.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
