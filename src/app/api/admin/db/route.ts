import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

// Generic admin CRUD endpoint — all writes go through here
// Verifies admin JWT before executing any operation
export async function POST(request: Request) {
  const admin = getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { table, operation, data, match, select, rpc, rpcParams } = body;

    // RPC call support
    if (rpc) {
      const { data: result, error } = await supabase.rpc(rpc, rpcParams || {});
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, data: result });
    }

    if (!table || !operation) {
      return NextResponse.json({ error: 'Missing table or operation' }, { status: 400 });
    }

    // Whitelist allowed tables for safety
    const allowedTables = [
      'products', 'stock_accounts', 'buyers', 'orders', 'payments',
      'account_assignments', 'payment_methods', 'resellers',
      'reseller_commissions', 'reseller_product_commissions', 'support_tickets', 'audit_logs',
      'promos', 'discount_campaigns',
    ];
    if (!allowedTables.includes(table)) {
      return NextResponse.json({ error: 'Table not allowed' }, { status: 403 });
    }

    let query;

    switch (operation) {
      case 'select': {
        query = supabase.from(table).select(select || '*');
        if (match) {
          for (const [key, value] of Object.entries(match)) {
            query = query.eq(key, value);
          }
        }
        const { data: selectData, error: selectErr } = await query;
        if (selectErr) return NextResponse.json({ error: selectErr.message }, { status: 400 });
        return NextResponse.json({ success: true, data: selectData });
      }

      case 'insert': {
        const { data: insertData, error: insertErr } = await supabase
          .from(table)
          .insert(data)
          .select();
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });
        return NextResponse.json({ success: true, data: insertData });
      }

      case 'update': {
        if (!match) return NextResponse.json({ error: 'Match required for update' }, { status: 400 });
        let updateQuery = supabase.from(table).update(data);
        for (const [key, value] of Object.entries(match)) {
          updateQuery = updateQuery.eq(key, value as string);
        }
        const { data: updateData, error: updateErr } = await updateQuery.select();
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });
        return NextResponse.json({ success: true, data: updateData });
      }

      case 'delete': {
        if (!match) return NextResponse.json({ error: 'Match required for delete' }, { status: 400 });
        let deleteQuery = supabase.from(table).delete();
        for (const [key, value] of Object.entries(match)) {
          deleteQuery = deleteQuery.eq(key, value as string);
        }
        const { error: deleteErr } = await deleteQuery;
        if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 400 });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Server error: ' + (err as Error).message }, { status: 500 });
  }
}
