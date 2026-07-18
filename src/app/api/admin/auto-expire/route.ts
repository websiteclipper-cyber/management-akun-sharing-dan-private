import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { sendTelegramNotification } from '@/lib/telegram';
import { getAdminFromRequest } from '@/lib/auth';

// This endpoint can be called by:
// 1. Vercel Cron (vercel.json cron schedule)
// 2. External cron service (e.g. cron-job.org)
// 3. Manually from admin dashboard
// Protected by CRON_SECRET or admin token
export async function POST(request: NextRequest) {
  try {
    // Verify authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // Allow if CRON_SECRET matches or admin token is valid
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      // Authorized via cron secret
    } else if (authHeader?.startsWith('Bearer ')) {
      if (!(await getAdminFromRequest(request))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the auto-expire function
    const { data, error } = await supabase.rpc('auto_expire_assignments');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data?.[0] || { expired_count: 0, updated_slots: 0, details: [] };

    // Send Telegram notification if there were expirations
    if (result.expired_count > 0) {
      const details = result.details || [];
      let detailsText = '';
      for (const d of details.slice(0, 10)) {
        detailsText += `  • ${d.buyer_name} — ${d.product_name}\n`;
      }
      if (details.length > 10) {
        detailsText += `  ...dan ${details.length - 10} lainnya\n`;
      }

      sendTelegramNotification(
        `⏰ <b>AUTO-EXPIRY REPORT</b>\n\n` +
        `✅ <b>${result.expired_count}</b> assignment expired\n` +
        `🔓 <b>${result.updated_slots}</b> slot dibebaskan\n\n` +
        (detailsText ? `Detail:\n${detailsText}` : '')
      );
    }

    return NextResponse.json({
      success: true,
      expired_count: result.expired_count,
      updated_slots: result.updated_slots,
      details: result.details,
      executed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Auto-expire error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Also support GET for simple cron calls
export async function GET(request: NextRequest) {
  return POST(request);
}
