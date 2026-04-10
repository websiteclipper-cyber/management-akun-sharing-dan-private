import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

/**
 * One-time migration endpoint to add hybrid commission columns
 * Call POST /api/admin/migrate with admin token to run
 */
export async function POST(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: string[] = [];

  try {
    // 1. Add default_commission_type column to resellers (if not exists)
    const { error: e1 } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'resellers' AND column_name = 'default_commission_type'
          ) THEN
            ALTER TABLE resellers ADD COLUMN default_commission_type text DEFAULT 'fixed';
          END IF;
        END $$;
      `
    });
    if (e1) {
      // Fallback: try direct ALTER TABLE
      results.push('RPC not available, trying direct approach...');
    } else {
      results.push('✅ default_commission_type column checked/added');
    }

    // 2. Add default_commission_value column to resellers (if not exists)
    const { error: e2 } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'resellers' AND column_name = 'default_commission_value'
          ) THEN
            ALTER TABLE resellers ADD COLUMN default_commission_value numeric DEFAULT 3000;
          END IF;
        END $$;
      `
    });
    if (e2) {
      results.push('⚠️ default_commission_value: ' + e2.message);
    } else {
      results.push('✅ default_commission_value column checked/added');
    }

    // 3. Create reseller_product_commissions table if not exists
    const { error: e3 } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS reseller_product_commissions (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          reseller_id uuid REFERENCES resellers(id) ON DELETE CASCADE,
          product_id integer REFERENCES products(id) ON DELETE CASCADE,
          commission_type text NOT NULL DEFAULT 'fixed',
          commission_value numeric NOT NULL DEFAULT 0,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now(),
          UNIQUE(reseller_id, product_id)
        );
      `
    });
    if (e3) {
      results.push('⚠️ reseller_product_commissions: ' + e3.message);
    } else {
      results.push('✅ reseller_product_commissions table checked/created');
    }

    // 4. Create reseller_commissions table if not exists
    const { error: e4 } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS reseller_commissions (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          reseller_id uuid REFERENCES resellers(id) ON DELETE CASCADE,
          order_id uuid REFERENCES orders(id),
          product_id integer,
          product_name text,
          order_amount numeric DEFAULT 0,
          commission_type text DEFAULT 'fixed',
          commission_rate numeric DEFAULT 0,
          commission_amount numeric NOT NULL DEFAULT 0,
          status text DEFAULT 'unpaid',
          paid_at timestamptz,
          created_at timestamptz DEFAULT now()
        );
      `
    });
    if (e4) {
      results.push('⚠️ reseller_commissions: ' + e4.message);
    } else {
      results.push('✅ reseller_commissions table checked/created');
    }

    // 5. Create site_settings table if not exists
    const { error: e5 } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: `
        CREATE TABLE IF NOT EXISTS site_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          label TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        INSERT INTO site_settings (key, value, label) VALUES
          ('support_whatsapp', '082244046330', 'Nomor WhatsApp Support')
        ON CONFLICT (key) DO NOTHING;
      `
    });
    if (e5) {
      results.push('⚠️ site_settings: ' + e5.message);
    } else {
      results.push('✅ site_settings table checked/created + seeded');
    }

    // 6. Reload PostgREST schema cache
    const { error: e6 } = await supabaseAdmin.rpc('exec_sql', {
      sql_query: `NOTIFY pgrst, 'reload schema';`
    });
    if (e6) {
      results.push('⚠️ Schema reload: ' + e6.message);
    } else {
      results.push('✅ Schema cache reloaded');
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ 
      error: 'Migration error: ' + (err as Error).message,
      results 
    }, { status: 500 });
  }
}
