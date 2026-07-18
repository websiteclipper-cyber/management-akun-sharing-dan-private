import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

function passwordValidationError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password harus terdiri dari 12-128 karakter.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password harus memiliki huruf besar, huruf kecil, dan angka.';
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();
    const validationError = passwordValidationError(password);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const payload = typeof token === 'string' ? verifyToken(token) : null;
    if (
      !payload ||
      payload.type !== 'admin_password_reset' ||
      typeof payload.resetVersion !== 'string'
    ) {
      return NextResponse.json({ error: 'Link reset tidak valid atau sudah kedaluwarsa.' }, { status: 401 });
    }

    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('id, email, password_hash, token_version')
      .eq('id', payload.id)
      .ilike('email', payload.email)
      .eq('status', 'active')
      .maybeSingle();

    if (!admin?.password_hash) {
      return NextResponse.json({ error: 'Link reset tidak valid atau sudah kedaluwarsa.' }, { status: 401 });
    }

    const currentVersion = crypto
      .createHash('sha256')
      .update(admin.password_hash)
      .digest('base64url');
    const currentBuffer = Buffer.from(currentVersion);
    const receivedBuffer = Buffer.from(payload.resetVersion);

    if (
      currentBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(currentBuffer, receivedBuffer)
    ) {
      return NextResponse.json({ error: 'Link reset sudah pernah digunakan.' }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const currentTokenVersion = Number(admin.token_version || 0);
    const { data: updated, error } = await supabaseAdmin
      .from('admins')
      .update({
        password_hash: passwordHash,
        token_version: currentTokenVersion + 1,
      })
      .eq('id', admin.id)
      .eq('password_hash', admin.password_hash)
      .eq('token_version', currentTokenVersion)
      .select('id')
      .maybeSingle();

    if (error || !updated) {
      return NextResponse.json({ error: 'Link reset sudah pernah digunakan.' }, { status: 409 });
    }

    return NextResponse.json({ success: true, message: 'Password berhasil diperbarui.' });
  } catch {
    return NextResponse.json({ error: 'Gagal memperbarui password.' }, { status: 500 });
  }
}
