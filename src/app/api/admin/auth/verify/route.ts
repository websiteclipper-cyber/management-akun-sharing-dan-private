import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const admin = await getAdminFromRequest(request);

  if (!admin) {
    return NextResponse.json(
      { valid: false, error: 'Invalid or expired admin token' },
      { status: 401 },
    );
  }

  return NextResponse.json({ valid: true, user: admin });
}
