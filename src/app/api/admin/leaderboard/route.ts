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
