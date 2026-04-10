import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// GET: Public endpoint to fetch public-facing settings (no auth required)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['support_whatsapp']);

    if (error) {
      // Fallback defaults if table doesn't exist
      return NextResponse.json({
        support_whatsapp: '082244046330',
      });
    }

    const settings: Record<string, string> = {};
    
    // Set defaults
    settings.support_whatsapp = '082244046330';
    
    // Override with DB values
    if (data) {
      for (const row of data) {
        settings[row.key] = row.value;
      }
    }

    return NextResponse.json(settings);
  } catch {
    // Fallback
    return NextResponse.json({
      support_whatsapp: '082244046330',
    });
  }
}
