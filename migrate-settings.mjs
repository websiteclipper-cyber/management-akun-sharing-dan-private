// Migration: Create site_settings table
// Run with: node migrate-settings.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple env files
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env.vercel') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing env vars. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🔄 Seeding site_settings...');

  // Seed default values (upsert — won't overwrite existing)
  const defaults = [
    { key: 'support_whatsapp', value: '082244046330', label: 'Nomor WhatsApp Support' },
  ];

  for (const setting of defaults) {
    const { error } = await supabase
      .from('site_settings')
      .upsert(setting, { onConflict: 'key' });

    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        console.log('⚠️  Table site_settings does not exist yet. Please create it in Supabase dashboard:');
        console.log(`
  CREATE TABLE site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    label TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
        `);
        console.log('Then run this script again.');
        return;
      }
      console.log(`❌ Error seeding ${setting.key}:`, error.message);
    } else {
      console.log(`✅ Setting "${setting.key}" = "${setting.value}"`);
    }
  }

  console.log('\n🎉 Migration complete!');
}

migrate();
