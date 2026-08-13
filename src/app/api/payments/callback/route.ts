import { NextResponse } from 'next/server';

// Legacy unsigned callback disabled. Payment providers must use a dedicated,
// signature-verified webhook endpoint such as /api/webhooks/klikqris.
export async function POST() {
  return NextResponse.json(
    { error: 'Legacy payment callback is disabled.' },
    { status: 410 },
  );
}
