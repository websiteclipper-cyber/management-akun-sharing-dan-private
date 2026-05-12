// Migration script for Warranty System
// Run with: node run-warranty-migration.mjs

import fs from 'fs';
import path from 'path';

// Parse .env.vercel manually
const envPath = path.join(process.cwd(), '.env.vercel');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
  console.error('Could not read .env.vercel');
  process.exit(1);
}

const lines = envContent.split('\n');
const envVars = {};
for (const line of lines) {
  const match = line.match(/^([^=]+)="?(.*)"?$/);
  if (match) {
    let val = match[2];
    if (val.endsWith('"')) val = val.slice(0, -1);
    envVars[match[1]] = val;
  }
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL || 'https://cxeosepxoszckudnwgdp.supabase.co';
const SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.vercel');
  process.exit(1);
}

const MIGRATION_SQL = `
-- ============================================
-- MIGRATION: Warranty Claims & Backup Accounts
-- ============================================

-- 1. Create backup_accounts table
CREATE TABLE IF NOT EXISTS backup_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id integer REFERENCES products(id) ON DELETE CASCADE,
  account_identifier text NOT NULL,
  account_secret_encrypted text NOT NULL,
  profile_info text,
  pin_info text,
  status text DEFAULT 'available', -- 'available', 'used', 'error'
  used_for_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  notes_internal text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create warranty_claims table
CREATE TABLE IF NOT EXISTS warranty_claims (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES buyers(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id),
  issue_type text NOT NULL, -- e.g., 'password_changed', 'screen_limit', 'suspended'
  issue_description text,
  status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'replaced'
  replacement_account_id uuid REFERENCES backup_accounts(id),
  resolution_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE backup_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_claims ENABLE ROW LEVEL SECURITY;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_backup_product_id ON backup_accounts(product_id);
CREATE INDEX IF NOT EXISTS idx_backup_status ON backup_accounts(status);
CREATE INDEX IF NOT EXISTS idx_warranty_order_id ON warranty_claims(order_id);
CREATE INDEX IF NOT EXISTS idx_warranty_status ON warranty_claims(status);

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Done! ✅
`;

async function main() {
  console.log('🚀 Running Warranty Migration via REST API...');
  
  // Since we cannot run raw SQL easily via PostgREST without a custom RPC function,
  // we will print it for the user if it fails, or try to run it via an existing RPC if one exists.
  
  console.log('\\n📝 SQL Script for Warranty Migration:');
  console.log('='.repeat(70));
  console.log(MIGRATION_SQL);
  console.log('='.repeat(70));
  console.log('\\nPlease run this SQL in your Supabase Dashboard SQL Editor!');
  console.log('https://supabase.com/dashboard/project/cxeosepxoszckudnwgdp/sql');
}

main().catch(console.error);
