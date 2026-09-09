import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest, isSuperAdmin } from '@/lib/auth';
import { readJsonBody } from '@/lib/publicApiSecurity';

const MAX_SELECT_ROWS = 5000;
const SUPER_ADMIN_WRITE_TABLES = new Set([
  'payments',
  'resellers',
  'reseller_commissions',
  'reseller_product_commissions',
  'audit_logs',
  'promos',
  'discount_campaigns',
  'site_settings',
]);

interface AdminDbBody {
  table?: string;
  operation?: 'select' | 'insert' | 'update' | 'delete';
  data?: Record<string, unknown> | Record<string, unknown>[];
  match?: Record<string, unknown>;
  select?: string;
  rpc?: string;
  rpcParams?: Record<string, unknown>;
}

// Generic admin CRUD endpoint — all writes go through here
// Verifies admin JWT before executing any operation
export async function POST(request: Request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await readJsonBody<AdminDbBody>(request, 64 * 1024);
    const { table, operation, data, match, select, rpc, rpcParams } = body;

    // RPC call support. Never pass a client-supplied function name through to
    // the service-role client: privileged functions (including SQL helpers)
    // must not become an arbitrary admin-controlled execution surface.
    if (rpc) {
      const allowedRpcs = new Set([
        'assign_account_for_order',
        'replace_account_assignment',
      ]);
      if (typeof rpc !== 'string' || !allowedRpcs.has(rpc)) {
        return NextResponse.json({ error: 'RPC not allowed' }, { status: 403 });
      }

      const { data: result, error } = await supabase.rpc(rpc, rpcParams || {});
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, data: result });
    }

    if (typeof table !== 'string' || typeof operation !== 'string') {
      return NextResponse.json({ error: 'Missing table or operation' }, { status: 400 });
    }

    // Whitelist allowed tables for safety
    const allowedTables = [
      'products', 'stock_accounts', 'buyers', 'orders', 'payments',
      'account_assignments', 'payment_methods', 'resellers',
      'reseller_commissions', 'reseller_product_commissions', 'support_tickets', 'audit_logs',
      'promos', 'discount_campaigns', 'site_settings',
    ];
    if (!allowedTables.includes(table)) {
      return NextResponse.json({ error: 'Table not allowed' }, { status: 403 });
    }
    if (operation !== 'select' && SUPER_ADMIN_WRITE_TABLES.has(table) && !isSuperAdmin(admin)) {
      return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
    }
    if (table === 'audit_logs' && operation !== 'select') {
      return NextResponse.json({ error: 'Audit logs are immutable' }, { status: 403 });
    }

    switch (operation) {
      case 'select': {
        const selectedRows: unknown[] = [];
        const pageSize = 1000;

        for (let from = 0; ; from += pageSize) {
          let selectQuery = supabase.from(table).select(select || '*');
          if (match) {
            for (const [key, value] of Object.entries(match)) {
              selectQuery = selectQuery.eq(key, value);
            }
          }

          const { data: pageData, error: selectErr } = await selectQuery
            .range(from, from + pageSize - 1);
          if (selectErr) {
            return NextResponse.json({ error: selectErr.message }, { status: 400 });
          }

          const rows = pageData || [];
          selectedRows.push(...rows);
          if (selectedRows.length >= MAX_SELECT_ROWS) break;
          if (rows.length < pageSize) break;
        }

        return NextResponse.json({ success: true, data: selectedRows });
      }

      case 'insert': {
        if (!data) return NextResponse.json({ error: 'Data required for insert' }, { status: 400 });
        const { data: insertData, error: insertErr } = await supabase
          .from(table)
          .insert(data)
          .select();
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });
        return NextResponse.json({ success: true, data: insertData });
      }

      case 'update': {
        if (!match || !data || Array.isArray(data)) {
          return NextResponse.json({ error: 'Match and object data required for update' }, { status: 400 });
        }
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
    if (err instanceof Error && err.message === 'REQUEST_TOO_LARGE') {
      return NextResponse.json({ error: 'Request terlalu besar.' }, { status: 413 });
    }
    if (err instanceof Error && err.message === 'UNSUPPORTED_CONTENT_TYPE') {
      return NextResponse.json({ error: 'Content-Type harus application/json.' }, { status: 415 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
