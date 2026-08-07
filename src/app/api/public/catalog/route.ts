import { NextResponse } from 'next/server';
import { getPublicCatalog } from '@/lib/public-home-data';

export async function GET() {
  const catalog = await getPublicCatalog();

  return NextResponse.json(catalog, {
    status: catalog.error ? 503 : 200,
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
