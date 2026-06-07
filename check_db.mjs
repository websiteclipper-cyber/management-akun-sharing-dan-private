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
  const { data: order } = await supabase.from('orders').select('*').eq('id', 1361).single();
  console.log("Calling RPC for order 1361... (expecting failure because quantity is 2 and we already have 2)");
  
  // increase quantity temporarily
  await supabase.from('orders').update({ quantity: 3 }).eq('id', 1361);
  
  const { data: res1, error } = await supabase.rpc('assign_account_for_order', { p_order_id: 1361 });
  console.log("Result 3:", res1, "Error:", error);
  
  await supabase.from('orders').update({ quantity: 2 }).eq('id', 1361);
}

run();
