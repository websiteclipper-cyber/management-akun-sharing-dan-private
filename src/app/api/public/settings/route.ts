import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET: Public endpoint to fetch public-facing settings (no auth required)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', [
        'support_whatsapp',
        'maintenance_mode',
        'maintenance_whatsapp_group',
        'global_promo_active',
        'global_promo_platform',
        'global_promo_title',
        'global_promo_subtitle',
        'global_promo_badge',
        'global_promo_normal_price',
        'global_promo_price',
        'global_promo_btn_text',
        'global_promo_btn_link'
      ]);

    if (error) {
      // Fallback defaults if table doesn't exist
      return NextResponse.json({
        support_whatsapp: '082244046330',
        maintenance_mode: 'false',
        maintenance_whatsapp_group: '',
      });
    }

    const settings: Record<string, string> = {};
    
    // Set defaults
    settings.support_whatsapp = '082244046330';
    settings.maintenance_mode = 'false';
    settings.maintenance_whatsapp_group = '';
    
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
      maintenance_mode: 'false',
      maintenance_whatsapp_group: '',
    });
  }
}
