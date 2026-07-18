import { NextResponse } from 'next/server';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('id, actor_type, action, entity_type, entity_id, created_at, admin:admins(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Gagal memuat audit log.' }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}
