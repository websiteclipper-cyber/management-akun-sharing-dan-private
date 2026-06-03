import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env.vercel') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function migratePins() {
  console.log("Fetching resellers...");
  const { data: resellers, error } = await supabase
    .from('resellers')
    .select('id, ref_code, pin');

  if (error) {
    console.error("Error fetching resellers:", error);
    process.exit(1);
  }

  console.log(`Found ${resellers.length} resellers. Checking PINs...`);
  let migratedCount = 0;
  let skippedCount = 0;

  for (const reseller of resellers) {
    const pin = reseller.pin || '';
    
    // Check if it's already a bcrypt hash
    if (pin.startsWith('$2a$') || pin.startsWith('$2b$') || pin.startsWith('$2y$')) {
      skippedCount++;
      continue;
    }

    // Hash it
    try {
      const hashedPin = await bcrypt.hash(pin, 10);
      const { error: updateError } = await supabase
        .from('resellers')
        .update({ pin: hashedPin })
        .eq('id', reseller.id);

      if (updateError) {
        console.error(`Error updating PIN for ${reseller.ref_code}:`, updateError);
      } else {
        migratedCount++;
        console.log(`Migrated PIN for ${reseller.ref_code}`);
      }
    } catch (err) {
      console.error(`Failed to hash PIN for ${reseller.ref_code}:`, err);
    }
  }

  console.log(`\nMigration completed.`);
  console.log(`Migrated: ${migratedCount}`);
  console.log(`Skipped (already hashed): ${skippedCount}`);
}

migratePins();
