import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';
import { supabaseAdmin as supabase } from '@/lib/supabase';

const REFUND_STATUSES = new Set(['pending', 'reviewing', 'approved', 'processing', 'completed', 'rejected']);

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = new URL(request.url).searchParams.get('status');
  if (status && status !== 'all' && !REFUND_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Filter status tidak valid.' }, { status: 400 });
  }

  let query = supabase
    .from('refund_requests')
    .select(`
      *,
      orders (
        order_number,
        total_amount,
        order_status,
        payment_status,
        buyer:buyers (name, email, phone),
        product:products (name, code)
      )
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Gagal memuat pengajuan refund.' }, { status: 400 });
  return NextResponse.json(data || []);
}

export async function PUT(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const id = Number(body.id);
    const status = normalizeText(body.status, 30);
    const adminNotes = normalizeText(body.admin_notes, 2000);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'ID pengajuan tidak valid.' }, { status: 400 });
    }
    if (!REFUND_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Status refund tidak valid.' }, { status: 400 });
    }

    const { data: previous, error: previousError } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('id', id)
      .single();
    if (previousError || !previous) {
      return NextResponse.json({ error: 'Pengajuan refund tidak ditemukan.' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('refund_requests')
      .update({
        status,
        admin_notes: adminNotes || null,
        processed_at: status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Gagal memperbarui status refund.' }, { status: 400 });

    const { error: auditError } = await supabase.from('audit_logs').insert({
      admin_id: admin.id,
      actor_type: 'admin',
      action: 'update_refund_request',
      entity_type: 'refund_request',
      entity_id: id,
      before_data: previous,
      after_data: data,
    });
    if (auditError) console.error('Failed to write refund audit log:', auditError.message);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Admin refund update error:', error);
    return NextResponse.json({ error: 'Terjadi kesalahan saat memperbarui refund.' }, { status: 500 });
  }
}
