import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

// GET: Fetch current global commission settings (from the first active reseller as template)
export async function GET(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get default commission from first active reseller
    const { data: templateReseller } = await supabase
      .from('resellers')
      .select('default_commission_type, default_commission_value')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Get all products
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price')
      .eq('status', 'active')
      .order('name');

    // Get product-specific commissions from the template reseller
    let productCommissions: Record<number, { commission_type: string; commission_value: number }> = {};

    if (templateReseller) {
      const { data: firstActiveReseller } = await supabase
        .from('resellers')
        .select('id')
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (firstActiveReseller) {
        const { data: specificComms } = await supabase
          .from('reseller_product_commissions')
          .select('product_id, commission_type, commission_value')
          .eq('reseller_id', firstActiveReseller.id);

        if (specificComms) {
          specificComms.forEach(c => {
            productCommissions[c.product_id] = {
              commission_type: c.commission_type,
              commission_value: c.commission_value,
            };
          });
        }
      }
    }

    return NextResponse.json({
      defaultCommission: {
        type: templateReseller?.default_commission_type || 'fixed',
        value: templateReseller?.default_commission_value ?? 3000,
      },
      products: products || [],
      productCommissions,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}

// POST: Save commission settings and apply to ALL resellers
export async function POST(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { defaultCommission, productCommissions } = await request.json();

    // Validate
    if (!defaultCommission || !defaultCommission.type || defaultCommission.value === undefined) {
      return NextResponse.json({ error: 'Data komisi default tidak valid' }, { status: 400 });
    }

    // 1. Update ALL resellers' default commission
    const { error: updateErr } = await supabase
      .from('resellers')
      .update({
        default_commission_type: defaultCommission.type,
        default_commission_value: defaultCommission.value,
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows

    if (updateErr) {
      return NextResponse.json({ error: 'Gagal update default komisi: ' + updateErr.message }, { status: 500 });
    }

    // 2. Get all reseller IDs
    const { data: allResellers } = await supabase
      .from('resellers')
      .select('id');

    if (!allResellers || allResellers.length === 0) {
      return NextResponse.json({ success: true, message: 'Belum ada mitra, settings disimpan.' });
    }

    // 3. Delete ALL existing product-specific commissions
    for (const reseller of allResellers) {
      await supabase
        .from('reseller_product_commissions')
        .delete()
        .eq('reseller_id', reseller.id);
    }

    // 4. Insert new product-specific commissions for ALL resellers
    if (productCommissions && Object.keys(productCommissions).length > 0) {
      const rows: Array<{
        reseller_id: string;
        product_id: number;
        commission_type: string;
        commission_value: number;
      }> = [];

      for (const reseller of allResellers) {
        for (const [productId, comm] of Object.entries(productCommissions)) {
          const c = comm as { commission_type: string; commission_value: number };
          rows.push({
            reseller_id: reseller.id,
            product_id: parseInt(productId),
            commission_type: c.commission_type,
            commission_value: c.commission_value,
          });
        }
      }

      if (rows.length > 0) {
        // Insert in batches of 500
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const { error: insertErr } = await supabase
            .from('reseller_product_commissions')
            .insert(batch);

          if (insertErr) {
            console.error('Batch insert error:', insertErr);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Komisi berhasil diterapkan ke ${allResellers.length} mitra!`,
      count: allResellers.length,
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
