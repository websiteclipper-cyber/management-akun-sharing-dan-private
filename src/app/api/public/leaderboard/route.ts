import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// Get current date string in WIB (UTC+7) — e.g. "2026-04-20"
function getWIBDateString(): string {
  const now = new Date();
  // Convert to WIB (UTC+7)
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// Generate random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Round to nearest 1000
function roundTo1000(n: number): number {
  return Math.round(n / 1000) * 1000;
}

// Perform daily reset: randomize commission values & shuffle ranks
async function performDailyReset(minCommission: number, maxCommission: number) {
  // Get all active entries
  const { data: entries } = await supabase
    .from('dummy_leaderboard')
    .select('id')
    .eq('is_active', true)
    .order('id');

  if (!entries || entries.length === 0) return;

  // Generate random commissions and sort descending to assign ranks
  const randomized = entries.map(e => ({
    id: e.id,
    commission: roundTo1000(randomInt(minCommission, maxCommission)),
  }));

  // Sort by commission descending so rank 1 = highest
  randomized.sort((a, b) => b.commission - a.commission);

  // Update each entry with new commission and new rank
  for (let i = 0; i < randomized.length; i++) {
    await supabase
      .from('dummy_leaderboard')
      .update({
        commission_today: randomized[i].commission,
        rank_position: i + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', randomized[i].id);
  }

  // Save today's date as last reset date
  const today = getWIBDateString();
  await supabase
    .from('site_settings')
    .upsert({
      key: 'leaderboard_last_reset',
      value: today,
      label: 'Tanggal Terakhir Reset Leaderboard',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
}

// GET: Public endpoint — returns active leaderboard entries (no auth required)
export async function GET() {
  try {
    // Check if we need to reset today
    const { data: settingsData } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', [
        'leaderboard_last_reset',
        'leaderboard_min_commission',
        'leaderboard_max_commission',
      ]);

    const settingsMap: Record<string, string> = {};
    if (settingsData) {
      for (const row of settingsData) {
        settingsMap[row.key] = row.value;
      }
    }

    const lastReset = settingsMap.leaderboard_last_reset || '';
    const today = getWIBDateString();
    const minCommission = Number(settingsMap.leaderboard_min_commission) || 50000;
    const maxCommission = Number(settingsMap.leaderboard_max_commission) || 500000;

    // If last reset date is not today, perform daily reset
    if (lastReset !== today) {
      await performDailyReset(minCommission, maxCommission);
    }

    // Fetch and return leaderboard
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
