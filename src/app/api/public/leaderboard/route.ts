import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// GET: Public endpoint — returns active leaderboard entries (no auth required)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('dummy_leaderboard')
      .select('mitra_name, commission_today, rank_position, avatar_emoji')
      .eq('is_active', true)
      .order('rank_position', { ascending: true })
      .limit(10);

    if (error) {
      // Table might not exist yet — return empty
      return NextResponse.json({ entries: [] });
    }

    return NextResponse.json({ entries: data || [] });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}
