import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { getAdminFromRequest } from '@/lib/auth';

export async function POST(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      product_id, account_identifier, account_secret,
      profile_info, pin_info, notes_internal, two_factor_secret,
      account_type, max_slot, purchase_cost,
    } = body;

    if (!product_id || !account_identifier || !account_secret) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const encrypted = encrypt(account_secret);
    const encryptedTwoFactor = two_factor_secret ? encrypt(two_factor_secret) : null;
    const now = new Date().toISOString();

    const { data, error } = await supabase.from('stock_accounts').insert({
      product_id,
      account_identifier,
      account_secret_encrypted: encrypted,
      two_factor_secret_encrypted: encryptedTwoFactor,
      profile_info,
      pin_info,
      notes_internal,
      account_type,
      max_slot,
      current_used_slot: 0,
      status: 'active',
      purchase_cost,
      acquired_at: now,
      created_at: now,
      updated_at: now,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, product_id, account_identifier, account_secret, profile_info, pin_info, notes_internal, two_factor_secret, purchase_cost, account_type, max_slot, current_used_slot } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const updateData: Record<string, unknown> = {
      product_id,
      account_identifier,
      profile_info,
      pin_info,
      notes_internal,
      purchase_cost,
      account_type,
      max_slot,
      updated_at: new Date().toISOString(),
    };

    if (current_used_slot !== undefined) {
      updateData.current_used_slot = current_used_slot;
    }

    if (account_secret) {
      updateData.account_secret_encrypted = encrypt(account_secret);
    }

    if (two_factor_secret) {
      updateData.two_factor_secret_encrypted = encrypt(two_factor_secret);
    }

    const { data, error } = await supabase.from('stock_accounts').update(updateData).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
