// Script to add newcomer_price column via Supabase Management API
// Then set it for SuperGrok Sharing 3 Hari

const SUPABASE_URL = 'https://cxeosepxoszckudnwgdp.supabase.co';
const SERVICE_ROLE_KEY = '[REDACTED_SERVICE_ROLE_JWT]';
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || '';

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function main() {
  // ====== Step 1: Check if column exists by trying to query it ======
  console.log('🔍 Step 1: Checking if newcomer_price column exists...\n');

  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,newcomer_price&limit=1`, {
    headers,
  });

  if (checkRes.ok) {
    console.log('✅ newcomer_price column already exists!\n');
  } else {
    console.log('❌ Column does not exist yet.');
    console.log('\n📋 Please run this SQL in Supabase Dashboard SQL Editor:');
    console.log('   Go to: https://supabase.com/dashboard/project/cxeosepxoszckudnwgdp/sql\n');
    console.log('='.repeat(60));
    console.log(`
ALTER TABLE products ADD COLUMN IF NOT EXISTS newcomer_price numeric DEFAULT NULL;
NOTIFY pgrst, 'reload schema';
    `);
    console.log('='.repeat(60));
    console.log('\nAfter running the SQL, run this script again to set the price.\n');
    return;
  }

  // ====== Step 2: Find SuperGrok Sharing 3 Hari ======
  console.log('🔍 Step 2: Looking for Grok products...\n');

  const findRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id,name,price,newcomer_price,duration_days,account_type&platform_name=ilike.*grok*&order=id`, {
    headers,
  });
  const products = await findRes.json();

  if (!Array.isArray(products) || products.length === 0) {
    console.log('❌ No Grok products found!');
    return;
  }

  console.log('All Grok products:');
  products.forEach(p => {
    console.log(`  ID: ${p.id} | ${p.name} | ${p.duration_days}d ${p.account_type} | Price: Rp ${p.price?.toLocaleString()} | Newcomer: ${p.newcomer_price ? 'Rp ' + p.newcomer_price.toLocaleString() : '—'}`);
  });

  // Find the SuperGrok Sharing 3 Hari
  const target = products.find(p =>
    p.name.toLowerCase().includes('sharing') &&
    p.name.toLowerCase().includes('3') &&
    p.account_type === 'sharing'
  );

  if (!target) {
    console.log('\n⚠️ Could not auto-detect SuperGrok Sharing 3 Hari.');
    console.log('Please set newcomer_price manually via Admin > Produk.');
    return;
  }

  console.log(`\n🎯 Target product: "${target.name}" (ID: ${target.id})`);

  if (target.newcomer_price === 7000) {
    console.log('✅ newcomer_price already set to Rp 7,000!');
    return;
  }

  // ====== Step 3: Update newcomer_price ======
  console.log(`\n💰 Step 3: Setting newcomer_price = Rp 7,000 (regular = Rp ${target.price?.toLocaleString()})...`);

  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${target.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      newcomer_price: 7000,
      updated_at: new Date().toISOString(),
    }),
  });

  if (updateRes.ok) {
    const updated = await updateRes.json();
    console.log('\n✅ SUCCESS!');
    console.log(`   Product: ${updated[0].name}`);
    console.log(`   Regular price:  Rp ${Number(updated[0].price).toLocaleString()}`);
    console.log(`   Newcomer price: Rp ${Number(updated[0].newcomer_price).toLocaleString()}`);
    console.log('\n🎉 Buyer baru sekarang akan dapat harga Rp 7,000!');
  } else {
    const err = await updateRes.text();
    console.log('❌ Failed:', updateRes.status, err);
  }
}

main().catch(console.error);
