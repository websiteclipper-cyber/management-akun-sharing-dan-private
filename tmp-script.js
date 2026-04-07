const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://cxeosepxoszckudnwgdp.supabase.co', '[REDACTED_SERVICE_ROLE_JWT]');
async function run() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: "SELECT pg_get_functiondef(p.oid) FROM pg_proc p WHERE proname = 'assign_account_for_order';"
  });
  console.log(error || data);
}
run();
