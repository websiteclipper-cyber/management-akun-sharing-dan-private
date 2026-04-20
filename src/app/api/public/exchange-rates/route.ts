import { NextResponse } from 'next/server';

// Cache exchange rates in memory (server-side)
let cachedRates: Record<string, number> | null = null;
let cachedAt = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export async function GET() {
  // Return cached if still fresh
  if (cachedRates && Date.now() - cachedAt < CACHE_TTL) {
    return NextResponse.json({ rates: cachedRates, cached: true });
  }

  try {
    // Free API — no key needed, 1500 requests/month
    const res = await fetch('https://open.er-api.com/v6/latest/IDR', {
      next: { revalidate: 21600 }, // 6 hours
    });

    if (!res.ok) {
      // Return stale cache or empty
      return NextResponse.json(
        { rates: cachedRates || {}, error: 'Failed to fetch rates' },
        { status: 200 }
      );
    }

    const data = await res.json();

    if (data.rates) {
      cachedRates = data.rates;
      cachedAt = Date.now();
    }

    return NextResponse.json({ rates: data.rates || {} });
  } catch {
    return NextResponse.json(
      { rates: cachedRates || {}, error: 'Exchange rate API unavailable' },
      { status: 200 }
    );
  }
}
