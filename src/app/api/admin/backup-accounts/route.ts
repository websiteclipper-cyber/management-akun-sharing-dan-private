import { NextRequest, NextResponse } from 'next';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { encrypt } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const status = searchParams.get('status');

    let query = supabase.from('backup_accounts').select(`
      *,
      products (name, code)
    `).order('created_at', { ascending: false });

    if (productId) query = query.eq('product_id', productId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, account_identifier, account_secret, profile_info, pin_info, notes } = body;

    if (!product_id || !account_identifier || !account_secret) {
      return NextResponse.json({ error: 'Data wajib tidak lengkap' }, { status: 400 });
    }

    const { data, error } = await supabase.from('backup_accounts').insert({
      product_id,
      account_identifier,
      account_secret_encrypted: encrypt(account_secret),
      profile_info,
      pin_info,
      notes,
      status: 'available',
      is_used: false,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, product_id, account_identifier, account_secret, profile_info, pin_info, status, is_used, notes } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const updateData: any = {
      product_id,
      account_identifier,
      profile_info,
      pin_info,
      status,
      is_used,
      notes,
      updated_at: new Date().toISOString()
    };

    if (account_secret && account_secret.trim() !== '') {
      updateData.account_secret_encrypted = encrypt(account_secret);
    }

    const { data, error } = await supabase.from('backup_accounts').update(updateData).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const { error } = await supabase.from('backup_accounts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
