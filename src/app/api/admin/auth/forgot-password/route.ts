import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

const GENERIC_RESPONSE = {
  success: true,
  message: 'Jika email terdaftar sebagai admin aktif, link reset telah dikirim.',
};

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('id, name, email, password_hash')
      .ilike('email', normalizedEmail)
      .eq('status', 'active')
      .maybeSingle();

    if (!admin?.password_hash) return NextResponse.json(GENERIC_RESPONSE);

    // Binding the token to the current password hash makes it single-use.
    const resetVersion = crypto
      .createHash('sha256')
      .update(admin.password_hash)
      .digest('base64url');

    const token = signToken({
      type: 'admin_password_reset',
      id: admin.id,
      name: admin.name || 'Admin',
      email: admin.email || normalizedEmail,
      resetVersion,
    }, 0.25);

    const resetUrl = new URL(
      process.env.ADMIN_PASSWORD_RESET_REDIRECT_URL ||
        'https://pastipremium.my.id/admin/reset-password'
    );
    resetUrl.searchParams.set('token', token);

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );

    const { error } = await authClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: resetUrl.toString(), shouldCreateUser: true },
    });

    if (error) console.error('Admin password-reset delivery failed:', error.message);
    return NextResponse.json(GENERIC_RESPONSE);
  } catch {
    return NextResponse.json(GENERIC_RESPONSE);
  }
}
