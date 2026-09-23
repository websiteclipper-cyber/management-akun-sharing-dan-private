import { NextResponse } from 'next/server';
import { getPublicSettings } from '@/lib/public-home-data';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Share the server cache with the homepage. Keep browsers fresh so admin
  // changes take effect on the next check after cache invalidation.
  return NextResponse.json(await getPublicSettings(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
