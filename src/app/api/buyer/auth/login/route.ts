import { NextResponse } from 'next/server';

// Disabled until a verified OTP or magic-link flow is implemented. The former
// flow issued an account token to anyone who knew a buyer's phone number.
export async function POST() {
  return NextResponse.json(
    { error: 'Buyer login is temporarily unavailable while verification is being upgraded.' },
    { status: 503 },
  );
}
