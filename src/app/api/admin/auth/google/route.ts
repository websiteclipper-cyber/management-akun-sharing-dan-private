import { NextResponse } from 'next/server';

// Temporarily disabled: the previous implementation trusted a client-supplied
// email address without verifying a Google ID token.
export async function POST() {
  return NextResponse.json(
    { error: 'Google admin login is temporarily disabled' },
    { status: 503 },
  );
}
