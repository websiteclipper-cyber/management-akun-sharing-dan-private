import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.vercel') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching warranty claims...");
  const { data: claims, error } = await supabase
    .from('warranty_claims')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Error fetching claims:", error);
    return;
  }

  console.log(`Found ${claims.length} total claims. Grouping by order_id and email...`);

  // Group by order_id + email
  const grouped = new Map<string, any[]>();
  for (const claim of claims) {
    if (!claim.order_id || !claim.reported_email) continue;
    const key = `${claim.order_id}_${claim.reported_email.toLowerCase().trim()}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(claim);
  }

  let deletedCount = 0;

  for (const [key, group] of grouped) {
    if (group.length > 1) {
      console.log(`Found ${group.length} duplicates for key: ${key}`);
      
      // Determine which one to keep
      let keepClaim = group[0]; // default to oldest
      
      // If there's an 'auto_replaced' one, prioritize keeping it
      const autoReplaced = group.find(c => c.status === 'auto_replaced');
      if (autoReplaced) {
        keepClaim = autoReplaced;
      } else {
        // Otherwise try to find one that has backup assignment (manual_review or pending but maybe not no_backup if possible)
        const valid = group.find(c => c.status !== 'no_backup' && c.status !== 'invalid_claim');
        if (valid) {
          keepClaim = valid;
        }
      }

      const toDelete = group.filter(c => c.id !== keepClaim.id);
      for (const del of toDelete) {
        console.log(`  -> Deleting duplicate claim: ${del.claim_code} (Status: ${del.status}, Created: ${del.created_at})`);
        const { error: delError } = await supabase.from('warranty_claims').delete().eq('id', del.id);
        if (delError) {
          console.error(`  -> Error deleting ${del.id}:`, delError);
        } else {
          deletedCount++;
        }
      }
      console.log(`  -> Kept: ${keepClaim.claim_code} (Status: ${keepClaim.status})`);
    }
  }

  console.log(`Done. Cleaned up ${deletedCount} duplicate claims.`);
}

run();
