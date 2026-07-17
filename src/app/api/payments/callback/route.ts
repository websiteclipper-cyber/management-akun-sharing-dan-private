import { NextResponse } from 'next/server';

// Permanently fail closed. Payment state must only be updated by a verified
// gateway webhook or a server-to-server transaction status check.
export async function POST() {
  return NextResponse.json(
    { error: 'Legacy payment callback is disabled' },
    { status: 410 },
  );
}
