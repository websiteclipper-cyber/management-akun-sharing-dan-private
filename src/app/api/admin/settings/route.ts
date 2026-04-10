import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

// Ensure site_settings table exists
async function ensureTable() {
  await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        label TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      INSERT INTO site_settings (key, value, label) VALUES
        ('support_whatsapp', '082244046330', 'Nomor WhatsApp Support')
      ON CONFLICT (key) DO NOTHING;
    `
  }).then(() => {}).catch(() => {
    // rpc might not exist, try raw approach
  });
}

// GET: Fetch all settings
export async function GET(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .order('key');

    if (error) {
      // Table might not exist yet, try creating it
      await ensureTable();
      const { data: retryData } = await supabase
        .from('site_settings')
        .select('*')
        .order('key');
      return NextResponse.json({ settings: retryData || [] });
    }

    return NextResponse.json({ settings: data || [] });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}

// POST: Update settings
export async function POST(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { settings } = await request.json();

    if (!settings || !Array.isArray(settings)) {
      return NextResponse.json({ error: 'Data settings tidak valid' }, { status: 400 });
    }

    for (const s of settings) {
      if (!s.key || s.value === undefined) continue;

      await supabase
        .from('site_settings')
        .upsert({
          key: s.key,
          value: String(s.value).trim(),
          label: s.label || s.key,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
    }

    return NextResponse.json({ success: true, message: 'Settings berhasil disimpan!' });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
