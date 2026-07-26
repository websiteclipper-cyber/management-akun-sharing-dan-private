import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

const ADMIN_DECISION_STATUSES = new Set(['pending', 'approved', 'rejected']);

export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, admin_notes, resolution_notes, new_email } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });
    }

    if (status !== undefined && !ADMIN_DECISION_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Status keputusan tidak valid' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) {
      updateData.status = status;
      updateData.resolved_at = status === 'pending' ? null : new Date().toISOString();
    }

    if (admin_notes !== undefined) updateData.admin_notes = admin_notes;
    if (new_email !== undefined) updateData.new_email = new_email;

    if (resolution_notes !== undefined) {
      updateData.resolution_notes = resolution_notes;
    } else if (status === 'approved') {
      updateData.resolution_notes = 'Klaim diterima setelah peninjauan manual admin.';
    } else if (status === 'rejected') {
      updateData.resolution_notes = 'Klaim ditolak setelah peninjauan manual karena tidak memenuhi ketentuan garansi.';
    }

    const { data, error } = await supabase
      .from('warranty_claims')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
