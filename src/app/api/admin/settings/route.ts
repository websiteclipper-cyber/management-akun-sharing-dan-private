import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';
import { normalizeWhatsAppGroupLink } from '@/lib/phone';

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
        ('support_whatsapp', '082244046330', 'Nomor WhatsApp Support'),
        ('maintenance_mode', 'false', 'Mode Maintenance Website'),
        ('maintenance_whatsapp_group', '', 'Link Grup WhatsApp Maintenance')
      ON CONFLICT (key) DO NOTHING;
    `
  });
}

// GET: Fetch all settings
export async function GET(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSuperAdmin(admin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { settings } = await request.json();

    if (!settings || !Array.isArray(settings)) {
      return NextResponse.json({ error: 'Data settings tidak valid' }, { status: 400 });
    }

    const payload = settings
      .filter(s => s && typeof s.key === 'string' && s.value !== undefined)
      .map(s => ({
          key: s.key,
          value: String(s.value).trim(),
          label: s.label || s.key,
          updated_at: new Date().toISOString(),
      }));

    if (payload.length === 0) {
      return NextResponse.json({ error: 'Tidak ada pengaturan yang dapat disimpan' }, { status: 400 });
    }

    const groupSetting = payload.find(s => s.key === 'maintenance_whatsapp_group');
    if (groupSetting?.value) {
      const normalizedGroupLink = normalizeWhatsAppGroupLink(groupSetting.value);
      if (!normalizedGroupLink) {
        return NextResponse.json({
          error: 'Link grup WhatsApp tidak valid. Gunakan https://chat.whatsapp.com/...',
        }, { status: 400 });
      }
      groupSetting.value = normalizedGroupLink;
    }

    const { error } = await supabase
      .from('site_settings')
      .upsert(payload, { onConflict: 'key' });

    if (error) {
      console.error('Failed to save site settings:', error.message);
      return NextResponse.json({ error: 'Gagal menyimpan pengaturan' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Settings berhasil disimpan!' });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
