import { NextRequest, NextResponse } from 'next/server';
import { getBuyerAccessFromRequest } from '@/lib/auth';
import {
  BUYER_BAN_MESSAGE,
  BUYER_BAN_TITLE,
  isBuyerBannedStatus,
} from '@/lib/buyerBan';

export async function GET(request: NextRequest) {
  const access = await getBuyerAccessFromRequest(request);
  if (!access) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isBuyerBannedStatus(access.status)) {
    return NextResponse.json(
      {
        active: false,
        banned: true,
        title: BUYER_BAN_TITLE,
        message: BUYER_BAN_MESSAGE,
      },
      { status: 403 },
    );
  }

  if (access.status !== 'active') {
    return NextResponse.json(
      { active: false, error: 'Akun buyer tidak aktif.' },
      { status: 403 },
    );
  }

  return NextResponse.json({ active: true, banned: false });
}
