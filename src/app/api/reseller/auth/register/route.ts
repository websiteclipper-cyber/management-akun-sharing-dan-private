import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { name, phone, ref_code, pin } = await request.json();

    // Validate required fields
    if (!name || !phone || !ref_code || !pin) {
      return NextResponse.json(
        { error: 'Semua field wajib diisi: Nama, No. WhatsApp, Kode Referral, dan PIN' },
        { status: 400 }
      );
    }

    // Sanitize ref_code
    const cleanRefCode = ref_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanRefCode.length < 3) {
      return NextResponse.json(
        { error: 'Kode referral minimal 3 karakter (huruf & angka saja)' },
        { status: 400 }
      );
    }
    if (cleanRefCode.length > 20) {
      return NextResponse.json(
        { error: 'Kode referral maksimal 20 karakter' },
        { status: 400 }
      );
    }

    // Validate PIN
    const cleanPin = pin.trim();
    if (cleanPin.length < 4 || cleanPin.length > 20) {
      return NextResponse.json(
        { error: 'PIN harus antara 4–20 karakter' },
        { status: 400 }
      );
    }

    // Validate phone
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return NextResponse.json(
        { error: 'Nomor WhatsApp tidak valid (10–15 digit)' },
        { status: 400 }
      );
    }

    // Check if ref_code already exists
    const { data: existingCode } = await supabase
      .from('resellers')
      .select('id')
      .ilike('ref_code', cleanRefCode)
      .maybeSingle();

    if (existingCode) {
      return NextResponse.json(
        { error: `Kode referral "${cleanRefCode}" sudah digunakan. Silakan pilih kode lain.` },
        { status: 409 }
      );
    }

    // Check if phone already exists
    const { data: existingPhone } = await supabase
      .from('resellers')
      .select('id')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingPhone) {
      return NextResponse.json(
        { error: 'Nomor WhatsApp ini sudah terdaftar sebagai mitra' },
        { status: 409 }
      );
    }

    // Find an existing active reseller to copy the commission template from
    const { data: templateReseller } = await supabase
      .from('resellers')
      .select('id, default_commission_type, default_commission_value')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const defCommType = templateReseller?.default_commission_type || 'fixed';
    const defCommValue = templateReseller?.default_commission_value ?? 3000;

    // Create reseller with 'active' status (auto-approved)
    const { data: newReseller, error: insertError } = await supabase
      .from('resellers')
      .insert({
        name: name.trim(),
        phone: cleanPhone,
        ref_code: cleanRefCode,
        pin: cleanPin,
        default_commission_type: defCommType,
        default_commission_value: defCommValue,
        status: 'active',
        total_sales: 0,
        total_commission: 0,
        unpaid_commission: 0,
      })
      .select()
      .single();

    if (insertError || !newReseller) {
      console.error('Register reseller error:', insertError);
      return NextResponse.json(
        { error: 'Gagal mendaftarkan akun. Silakan coba lagi.' },
        { status: 500 }
      );
    }

    // Clone product-specific commissions if template exists
    if (templateReseller) {
      const { data: specificCommissions } = await supabase
        .from('reseller_product_commissions')
        .select('*')
        .eq('reseller_id', templateReseller.id);

      if (specificCommissions && specificCommissions.length > 0) {
        const clonedCommissions = specificCommissions.map(comm => ({
          reseller_id: newReseller.id,
          product_id: comm.product_id,
          commission_type: comm.commission_type,
          commission_value: comm.commission_value
        }));

        await supabase
          .from('reseller_product_commissions')
          .insert(clonedCommissions);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Pendaftaran berhasil! Akun Anda langsung aktif. Silakan login dan mulai berjualan!',
      reseller: {
        name: newReseller.name,
        ref_code: newReseller.ref_code,
        status: newReseller.status,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json(
      { error: 'Server error: ' + (err as Error).message },
      { status: 500 }
    );
  }
}
