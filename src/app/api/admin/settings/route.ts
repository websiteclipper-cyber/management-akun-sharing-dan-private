import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';
import {
  DEFAULT_MAINTENANCE_ANNOUNCEMENT,
  MAX_MAINTENANCE_ANNOUNCEMENT_LENGTH,
} from '@/lib/maintenance';
import { normalizeWhatsAppGroupLink } from '@/lib/phone';
import {
  MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH,
  MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH,
} from '@/lib/credential-tutorial';

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
        ('maintenance_announcement', '${DEFAULT_MAINTENANCE_ANNOUNCEMENT}', 'Pengumuman Penting Maintenance'),
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

    const announcementSetting = payload.find(s => s.key === 'maintenance_announcement');
    if (announcementSetting && announcementSetting.value.length > MAX_MAINTENANCE_ANNOUNCEMENT_LENGTH) {
      return NextResponse.json({
        error: `Pengumuman maintenance maksimal ${MAX_MAINTENANCE_ANNOUNCEMENT_LENGTH} karakter`,
      }, { status: 400 });
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

    for (const setting of payload) {
      if (setting.key === 'credential_tutorial_enabled' && !['true', 'false'].includes(setting.value)) {
        return NextResponse.json({ error: 'Status tutorial pemakaian tidak valid' }, { status: 400 });
      }
      if (setting.key === 'credential_tutorial_title' && setting.value.length > MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH) {
        return NextResponse.json({
          error: `Judul tutorial maksimal ${MAX_CREDENTIAL_TUTORIAL_TITLE_LENGTH} karakter`,
        }, { status: 400 });
      }
      if (setting.key === 'credential_tutorial_content' && setting.value.length > MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH) {
        return NextResponse.json({
          error: `Isi tutorial maksimal ${MAX_CREDENTIAL_TUTORIAL_CONTENT_LENGTH} karakter`,
        }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from('site_settings')
      .upsert(payload, { onConflict: 'key' });

    if (error) {
      console.error('Failed to save site settings:', error.message);
      return NextResponse.json({ error: 'Gagal menyimpan pengaturan' }, { status: 500 });
    }

    revalidateTag('public-home-settings', { expire: 0 });
    return NextResponse.json({ success: true, message: 'Settings berhasil disimpan!' });
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
