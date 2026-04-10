import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!code || code.length < 3) {
      return NextResponse.json({ available: false, error: 'Kode minimal 3 karakter' });
    }

    const { data } = await supabase
      .from('resellers')
      .select('id')
      .ilike('ref_code', code)
      .maybeSingle();

    return NextResponse.json({ available: !data, code });
  } catch {
    return NextResponse.json({ available: false, error: 'Server error' }, { status: 500 });
  }
}
