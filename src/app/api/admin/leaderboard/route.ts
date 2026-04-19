import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

// Ensure table exists
async function ensureTable() {
  try {
    await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS dummy_leaderboard (
          id SERIAL PRIMARY KEY,
          mitra_name TEXT NOT NULL,
          commission_today BIGINT NOT NULL DEFAULT 0,
          rank_position INT NOT NULL DEFAULT 1,
          avatar_emoji TEXT DEFAULT '🤝',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    });
  } catch {
    // RPC might not exist — table likely already exists
  }
}


// GET: List all leaderboard entries
export async function GET(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from('dummy_leaderboard')
      .select('*')
      .order('rank_position', { ascending: true });

    if (error) {
      // Table might not exist, create it
      await ensureTable();
      const { data: retryData } = await supabase
        .from('dummy_leaderboard')
        .select('*')
        .order('rank_position', { ascending: true });
      return NextResponse.json({ entries: retryData || [] });
    }

    return NextResponse.json({ entries: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create new entry
export async function POST(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mitra_name, commission_today, rank_position, avatar_emoji, is_active } = body;

    if (!mitra_name || commission_today === undefined) {
      return NextResponse.json({ error: 'Nama mitra dan komisi harus diisi' }, { status: 400 });
    }

    // Ensure table exists
    await ensureTable();

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('dummy_leaderboard')
      .insert({
        mitra_name,
        commission_today: Number(commission_today),
        rank_position: rank_position || 1,
        avatar_emoji: avatar_emoji || '🤝',
        is_active: is_active !== false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Update entry
export async function PUT(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, mitra_name, commission_today, rank_position, avatar_emoji, is_active } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (mitra_name !== undefined) updateData.mitra_name = mitra_name;
    if (commission_today !== undefined) updateData.commission_today = Number(commission_today);
    if (rank_position !== undefined) updateData.rank_position = rank_position;
    if (avatar_emoji !== undefined) updateData.avatar_emoji = avatar_emoji;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('dummy_leaderboard')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Manual reset — randomize commissions
export async function PATCH(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get min/max settings
    const { data: settingsData } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['leaderboard_min_commission', 'leaderboard_max_commission']);

    const settingsMap: Record<string, string> = {};
    if (settingsData) {
      for (const row of settingsData) {
        settingsMap[row.key] = row.value;
      }
    }

    const minCommission = Number(settingsMap.leaderboard_min_commission) || 50000;
    const maxCommission = Number(settingsMap.leaderboard_max_commission) || 500000;

    // Get all active entries
    const { data: entries } = await supabase
      .from('dummy_leaderboard')
      .select('id')
      .eq('is_active', true)
      .order('id');

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data mitra aktif' }, { status: 400 });
    }

    // Generate random commissions
    const randomized = entries.map(e => ({
      id: e.id,
      commission: Math.round((Math.floor(Math.random() * (maxCommission - minCommission + 1)) + minCommission) / 1000) * 1000,
    }));

    // Sort by commission descending
    randomized.sort((a, b) => b.commission - a.commission);

    // Update each entry
    const now = new Date().toISOString();
    for (let i = 0; i < randomized.length; i++) {
      await supabase
        .from('dummy_leaderboard')
        .update({
          commission_today: randomized[i].commission,
          rank_position: i + 1,
          updated_at: now,
        })
        .eq('id', randomized[i].id);
    }

    // Save today as last reset date (WIB)
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const today = wib.toISOString().slice(0, 10);
    await supabase
      .from('site_settings')
      .upsert({
        key: 'leaderboard_last_reset',
        value: today,
        label: 'Tanggal Terakhir Reset Leaderboard',
        updated_at: now,
      }, { onConflict: 'key' });

    return NextResponse.json({
      success: true,
      message: `Berhasil reset ${randomized.length} mitra! Range: Rp ${minCommission.toLocaleString()} - Rp ${maxCommission.toLocaleString()}`,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Remove entry
export async function DELETE(request: NextRequest) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const { error } = await supabase
      .from('dummy_leaderboard')
      .delete()
      .eq('id', Number(id));

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
