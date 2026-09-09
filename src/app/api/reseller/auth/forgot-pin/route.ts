import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Reset PIN mandiri dinonaktifkan untuk keamanan. Hubungi admin untuk verifikasi dan reset PIN.',
    },
    { status: 503 },
  );
}
