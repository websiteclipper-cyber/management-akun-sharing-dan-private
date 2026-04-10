import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env.vercel') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: firstPending } = await supabase.from('resellers').select('*').eq('status', 'active').limit(1).single();
  if (!firstPending) return;
  console.log("Found:", firstPending.id);
  
  const payload = {
    table: 'resellers',
    operation: 'update',
    data: { status: 'active', updated_at: new Date().toISOString() },
    match: { id: firstPending.id }
  };
  
  // Emulate the API
  let updateQuery = supabase.from(payload.table).update(payload.data);
  for (const [key, value] of Object.entries(payload.match)) {
    updateQuery = updateQuery.eq(key, value);
  }
  const { data, error } = await updateQuery.select();
  console.log("Result:", data, error);
}

run();
