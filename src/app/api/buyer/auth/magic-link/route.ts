import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consumePublicRateLimit, readJsonBody } from '@/lib/publicApiSecurity';

export async function POST(request: NextRequest) {
  try {
    const { email, redirect } = await readJsonBody<{ email?: unknown; redirect?: unknown }>(request);
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const safeRedirect = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
      ? redirect
      : '/';

    // Always use the same response to avoid exposing whether an address is a buyer.
    const success = NextResponse.json({
      success: true,
      message: 'Jika email terdaftar, link masuk telah dikirim.',
    });

    const rateLimit = await consumePublicRateLimit(request, 'buyer-magic-link', {
      maxRequests: 5,
      windowSeconds: 3600,
      subject: normalizedEmail,
    });
    if (rateLimit.limited) return success;

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return success;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const redirectUrl = new URL(process.env.BUYER_MAGIC_LINK_REDIRECT_URL || 'https://pastipremium.my.id/buyer/login');
    redirectUrl.searchParams.set('redirect', safeRedirect);
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error } = await authClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: redirectUrl.toString(), shouldCreateUser: true },
    });

    // Keep the response generic, but log delivery failures for server operators.
    if (error) console.error('Buyer magic-link delivery failed:', error.message);
    return success;
  } catch {
    return NextResponse.json({ success: true, message: 'Jika email terdaftar, link masuk telah dikirim.' });
  }
}
