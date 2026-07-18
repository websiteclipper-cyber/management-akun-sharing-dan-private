import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { getAdminFromRequest } from '@/lib/auth';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Internal server error';
}

export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const stockAccountId = searchParams.get('stock_account_id');
    const status = searchParams.get('status');
    const summaryOnly = searchParams.get('summary') === '1';

    const selectColumns = summaryOnly ? 'id, stock_account_id, is_used' : `
      id, stock_account_id, product_id, account_identifier,
      profile_info, pin_info, notes, sort_order, status, is_used,
      created_at, updated_at,
      stock_accounts (id, account_identifier, product_id, products:product_id (name, code)),
      products (name, code)
    `;
    const rows: unknown[] = [];
    const pageSize = 1000;

    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from('backup_accounts')
        .select(selectColumns)
        .order('created_at', { ascending: false });
      if (stockAccountId) query = query.eq('stock_account_id', stockAccountId);
      if (productId) query = query.eq('product_id', productId);
      if (status) query = query.eq('status', status);

      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const pageRows = data || [];
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }

    return NextResponse.json(rows);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { stock_account_id, product_id, account_identifier, account_secret, profile_info, pin_info, notes, sort_order } = body;

    if (!account_identifier || !account_secret) {
      return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 });
    }

    if (!stock_account_id && !product_id) {
      return NextResponse.json({ error: 'Harus memilih stok akun atau produk' }, { status: 400 });
    }

    // If stock_account_id provided, auto-resolve the product_id
    let resolvedProductId = product_id;
    if (stock_account_id && !product_id) {
      const { data: stockAcc } = await supabase
        .from('stock_accounts')
        .select('product_id')
        .eq('id', stock_account_id)
        .single();
      if (stockAcc) resolvedProductId = stockAcc.product_id;
    }

    // Get the next sort_order
    let nextSortOrder = sort_order ?? 0;
    if (sort_order === undefined || sort_order === null) {
      const { data: existing } = await supabase
        .from('backup_accounts')
        .select('sort_order')
        .eq(stock_account_id ? 'stock_account_id' : 'product_id', stock_account_id || product_id)
        .order('sort_order', { ascending: false })
        .limit(1);
      nextSortOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;
    }

    const { data, error } = await supabase.from('backup_accounts').insert({
      stock_account_id: stock_account_id || null,
      product_id: resolvedProductId || null,
      account_identifier,
      account_secret_encrypted: encrypt(account_secret),
      profile_info: profile_info || null,
      pin_info: pin_info || null,
      notes: notes || null,
      sort_order: nextSortOrder,
      status: 'available',
      is_used: false,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, stock_account_id, product_id, account_identifier, account_secret, profile_info, pin_info, status, is_used, notes } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const updateData: Record<string, unknown> = {
      account_identifier,
      profile_info: profile_info || null,
      pin_info: pin_info || null,
      notes: notes || null,
      updated_at: new Date().toISOString()
    };

    if (stock_account_id !== undefined) updateData.stock_account_id = stock_account_id;
    if (product_id !== undefined) updateData.product_id = product_id;
    if (status !== undefined) updateData.status = status;
    if (is_used !== undefined) updateData.is_used = is_used;

    if (account_secret && account_secret.trim() !== '') {
      updateData.account_secret_encrypted = encrypt(account_secret);
    }

    const { data, error } = await supabase.from('backup_accounts').update(updateData).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const { error } = await supabase.from('backup_accounts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
