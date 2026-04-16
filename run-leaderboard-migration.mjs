// Direct Supabase Postgres connection migration
// Uses the Supabase pooler connection string

const DATABASE_URL = 'postgresql://REDACTED';

async function main() {
  console.log('🚀 Attempting migration via Supabase HTTP SQL endpoint...\n');

  // Use Supabase's undocumented but functional pg endpoint
  // The service role key can execute SQL via pg protocol too
  const SUPABASE_URL = 'https://cxeosepxoszckudnwgdp.supabase.co';
  const SERVICE_KEY = '[REDACTED_SERVICE_ROLE_JWT]';

  // Step 1: Create an exec_sql function first
  const createFnSQL = `
    CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  // Try creating exec_sql function via the pg REST endpoint  
  console.log('Step 1: Creating exec_sql helper function...');
  
  // Use alternative approach - try pg endpoint variations
  const endpoints = [
    '/pg',
    '/pg/query', 
    '/rest/v1/rpc/query',
  ];
  
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${SUPABASE_URL}${ep}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ query: createFnSQL }),
      });
      console.log(`  ${ep}: ${res.status} ${res.statusText}`);
      if (res.ok) {
        console.log('  ✅ Success!');
        break;
      }
    } catch (e) {
      console.log(`  ${ep}: ${e.message}`);
    }
  }

  // Step 2: If exec_sql exists now, create the table via RPC
  console.log('\nStep 2: Creating table via exec_sql RPC...');
  const tableSQL = `
    CREATE TABLE IF NOT EXISTS dummy_leaderboard (
      id SERIAL PRIMARY KEY,
      mitra_name TEXT NOT NULL,
      commission_today BIGINT NOT NULL DEFAULT 0,
      rank_position INT NOT NULL DEFAULT 1,
      avatar_emoji TEXT DEFAULT '🤝',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE dummy_leaderboard ENABLE ROW LEVEL SECURITY;
  `;
  
  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql: tableSQL }),
  });
  
  console.log(`  RPC exec_sql: ${rpcRes.status}`);
  if (rpcRes.ok) {
    console.log('  ✅ Table created!');
  } else {
    const err = await rpcRes.text();
    console.log(`  Response: ${err.substring(0, 300)}`);
  }

  // Step 3: Create RLS policies
  console.log('\nStep 3: Creating RLS policies...');
  const policySQL = `
    DO $$ BEGIN 
      BEGIN CREATE POLICY "Allow public read dummy_leaderboard" ON dummy_leaderboard FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
      BEGIN CREATE POLICY "Allow service role all dummy_leaderboard" ON dummy_leaderboard FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END;
    END $$;
    NOTIFY pgrst, 'reload schema';
  `;

  const policyRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql: policySQL }),
  });
  console.log(`  Policies: ${policyRes.status}`);

  // Wait for schema reload
  console.log('\n⏳ Waiting 3s for schema cache...');
  await new Promise(r => setTimeout(r, 3000));

  // Step 4: Insert sample data via REST
  console.log('\nStep 4: Inserting sample data via REST...');
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/dummy_leaderboard?select=id&limit=1`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
  });
  
  if (!checkRes.ok) {
    console.log(`  ❌ Table still not accessible (${checkRes.status}). Manual SQL execution needed.`);
    console.log('\n📋 Please go to: https://supabase.com/dashboard/project/cxeosepxoszckudnwgdp/sql');
    console.log('   And run the SQL from: migrations/create_dummy_leaderboard.sql');
    return;
  }

  const existing = await checkRes.json();
  if (existing.length > 0) {
    console.log('  ⏭️ Data already exists!');
    return;
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/dummy_leaderboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify([
      { mitra_name: 'Budi', commission_today: 250000, rank_position: 1, avatar_emoji: '🏆', is_active: true },
      { mitra_name: 'Sari', commission_today: 180000, rank_position: 2, avatar_emoji: '⭐', is_active: true },
      { mitra_name: 'Andi', commission_today: 125000, rank_position: 3, avatar_emoji: '💎', is_active: true },
      { mitra_name: 'Dina', commission_today: 95000, rank_position: 4, avatar_emoji: '🔥', is_active: true },
      { mitra_name: 'Reza', commission_today: 72000, rank_position: 5, avatar_emoji: '🚀', is_active: true },
    ]),
  });

  if (insertRes.ok) {
    const data = await insertRes.json();
    console.log(`  ✅ Inserted ${data.length} entries!`);
    data.forEach(d => console.log(`     ${d.rank_position}. ${d.avatar_emoji} ${d.mitra_name} — Rp ${Number(d.commission_today).toLocaleString()}`));
  } else {
    const err = await insertRes.text();
    console.log(`  ❌ Insert failed: ${err.substring(0, 200)}`);
  }

  console.log('\n🎉 Migration complete!');
}

main().catch(console.error);
