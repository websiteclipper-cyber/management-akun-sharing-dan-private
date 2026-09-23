import 'server-only';

import { revalidateTag } from 'next/cache';
import { getServiceClient } from '@/lib/supabase';

// Run from the authenticated daily cron, rather than every public page view.
export async function resetDailyLeaderboard(): Promise<void> {
  const supabase = getServiceClient();
  const signal = AbortSignal.timeout(10_000);
  const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: settingsData, error: settingsError } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['leaderboard_last_reset', 'leaderboard_min_commission', 'leaderboard_max_commission'])
    .abortSignal(signal);
  if (settingsError) throw settingsError;
  const settings = Object.fromEntries((settingsData || []).map(row => [row.key, row.value]));
  if (settings.leaderboard_last_reset === today) return;

  const { data: entries, error: entriesError } = await supabase
    .from('dummy_leaderboard')
    .select('id')
    .eq('is_active', true)
    .order('id')
    .abortSignal(signal);
  if (entriesError) throw entriesError;
  if (!entries?.length) return;

  const min = Number(settings.leaderboard_min_commission) || 50000;
  const max = Number(settings.leaderboard_max_commission) || 500000;
  const randomized = entries.map(entry => ({
    id: entry.id,
    commission: Math.round((Math.floor(Math.random() * (max - min + 1)) + min) / 1000) * 1000,
  })).sort((a, b) => b.commission - a.commission);
  const now = new Date().toISOString();

  for (const [index, entry] of randomized.entries()) {
    const { error } = await supabase.from('dummy_leaderboard').update({
      commission_today: entry.commission,
      rank_position: index + 1,
      updated_at: now,
    }).eq('id', entry.id).abortSignal(signal);
    if (error) throw error;
  }
  const { error } = await supabase.from('site_settings').upsert({
    key: 'leaderboard_last_reset',
    value: today,
    label: 'Tanggal Terakhir Reset Leaderboard',
    updated_at: now,
  }, { onConflict: 'key' }).abortSignal(signal);
  if (error) throw error;
  revalidateTag('public-home-leaderboard', { expire: 0 });
}
