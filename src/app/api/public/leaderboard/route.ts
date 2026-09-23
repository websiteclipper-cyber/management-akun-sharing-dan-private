import { NextResponse } from 'next/server';
import { getPublicLeaderboard } from '@/lib/public-home-data';

export async function GET() {
  // Public reads must never trigger the daily database writes.
  return NextResponse.json({ entries: await getPublicLeaderboard() });
}
