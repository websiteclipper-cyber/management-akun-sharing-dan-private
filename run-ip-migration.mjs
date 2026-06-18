import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env.vercel') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.vercel");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = `
  ALTER TABLE resellers 
    ADD COLUMN IF NOT EXISTS last_login_ip text,
    ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
  
  NOTIFY pgrst, 'reload schema';
`;

async function run() {
  console.log("Adding last_login_ip and last_login_at columns to resellers table...");
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
    console.error("Migration failed:", error);
  } else {
    console.log("Migration successful!");
  }
}

run();
