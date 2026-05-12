import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase.from('warranty_claims').select(`
      *,
      orders (order_number, total_amount, buyer_email:buyers(name, email, phone)),
      products (name, code),
      backup_accounts (account_identifier)
    `).order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, admin_notes, resolution_notes, replacement_backup_id } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (status) updateData.status = status;
    if (admin_notes !== undefined) updateData.admin_notes = admin_notes;
    if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;

    if (status === 'resolved' || status === 'auto_replaced' || status === 'invalid_claim') {
      updateData.resolved_at = new Date().toISOString();
    }

    if (replacement_backup_id) {
      updateData.replacement_backup_id = replacement_backup_id;
      
      // Also mark backup as used if replacing
      await supabase.from('backup_accounts').update({
        status: 'used',
        is_used: true,
        used_at: new Date().toISOString()
      }).eq('id', replacement_backup_id);
    }

    const { data, error } = await supabase.from('warranty_claims').update(updateData).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
