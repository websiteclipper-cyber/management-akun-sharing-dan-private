import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';
import { getAdminFromRequest } from '@/lib/auth';
import { revalidateTag } from 'next/cache';

function validSlots(max: unknown, used: unknown): boolean {
  return typeof max === 'number' && Number.isSafeInteger(max) && max > 0
    && max <= 2147483647 && typeof used === 'number' && Number.isSafeInteger(used)
    && used >= 0 && used <= max;
}

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

    if (!validSlots(max_slot, 0)) {
      return NextResponse.json({ error: 'Kapasitas slot harus bilangan bulat minimal 1.' }, { status: 400 });
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
    revalidateTag('public-home-catalog', { expire: 0 });
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

    const { data: existing, error: readError } = await supabase.from('stock_accounts')
      .select('max_slot, current_used_slot, status, updated_at').eq('id', id).single();
    if (readError || !existing) {
      return NextResponse.json({ error: 'Stok akun tidak ditemukan. Muat ulang halaman.' }, { status: 404 });
    }
    const capacity = max_slot ?? existing.max_slot;
    const used = current_used_slot ?? existing.current_used_slot;
    if (!validSlots(capacity, used)) {
      return NextResponse.json({ error: 'Slot harus bilangan bulat. Kapasitas minimal 1 dan slot terpakai antara 0 hingga kapasitas.' }, { status: 400 });
    }
    if (body.expected_updated_at && body.expected_updated_at !== existing.updated_at) {
      return NextResponse.json({ error: 'Stok sudah berubah. Muat ulang halaman sebelum mengedit lagi.' }, { status: 409 });
    }

    const updateData: Record<string, unknown> = {
      product_id,
      account_identifier,
      profile_info,
      pin_info,
      notes_internal,
      purchase_cost,
      account_type,
      max_slot: capacity,
      current_used_slot: used,
      status: ['active', 'full'].includes(existing.status)
        ? (used >= capacity ? 'full' : 'active') : existing.status,
      updated_at: new Date().toISOString(),
    };

    if (account_secret) {
      updateData.account_secret_encrypted = encrypt(account_secret);
    }

    if (two_factor_secret) {
      updateData.two_factor_secret_encrypted = encrypt(two_factor_secret);
    }

    const { data, error } = await supabase.from('stock_accounts').update(updateData)
      .eq('id', id).eq('current_used_slot', existing.current_used_slot)
      .eq('max_slot', existing.max_slot).eq('status', existing.status)
      .eq('updated_at', existing.updated_at).select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'Stok berubah saat disimpan. Muat ulang halaman dan coba lagi.' }, { status: 409 });
    revalidateTag('public-home-catalog', { expire: 0 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
