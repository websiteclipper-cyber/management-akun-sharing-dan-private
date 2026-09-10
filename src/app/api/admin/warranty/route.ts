import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { getAdminFromRequest } from '@/lib/auth';

const ADMIN_DECISION_STATUSES = new Set(['pending', 'approved', 'rejected']);
const GEMINI_INVITE_STATUSES = new Set(['ready_to_invite', 'invite_sent', 'activated', 'failed']);

export async function GET(request: NextRequest) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase.from('warranty_claims').select(`
      *,
      orders (order_number, total_amount, buyer_email:buyers(name, email, phone)),
       products (name, code, warranty_fulfillment_type),
      backup_accounts (account_identifier)
    `).order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, admin_notes, resolution_notes, gemini_invite_status } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });
    }

    if (status !== undefined && !ADMIN_DECISION_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Status keputusan tidak valid' }, { status: 400 });
    }

    if (gemini_invite_status !== undefined && !GEMINI_INVITE_STATUSES.has(gemini_invite_status)) {
      return NextResponse.json({ error: 'Status invite Gemini tidak valid' }, { status: 400 });
    }

    const { data: claim, error: claimError } = await supabase
      .from('warranty_claims')
      .select('id, status, gemini_invite_email, gemini_invite_status, products(warranty_fulfillment_type)')
      .eq('id', id)
      .maybeSingle();
    if (claimError || !claim) {
      return NextResponse.json({ error: 'Klaim tidak ditemukan' }, { status: 404 });
    }
    const product = Array.isArray(claim.products) ? claim.products[0] : claim.products;
    const isGeminiInvite = product?.warranty_fulfillment_type === 'gemini_pro_invite';

    if (isGeminiInvite && status === 'approved' && gemini_invite_status !== 'activated') {
      return NextResponse.json({ error: 'Klaim Gemini diselesaikan melalui status Aktivasi Gemini, bukan pengiriman stok.' }, { status: 400 });
    }
    if (!isGeminiInvite && gemini_invite_status !== undefined) {
      return NextResponse.json({ error: 'Produk ini tidak menggunakan garansi invite Gemini Pro.' }, { status: 400 });
    }
    if (
      claim.gemini_invite_status === 'activated'
      && (status === 'rejected' || (gemini_invite_status && gemini_invite_status !== 'activated'))
    ) {
      return NextResponse.json({ error: 'Aktivasi Gemini yang sudah selesai tidak dapat dibuka kembali.' }, { status: 409 });
    }

    if (status === 'approved' && !isGeminiInvite) {
      const { data, error } = await supabase.rpc('approve_warranty_with_stock', {
        p_claim_id: String(id),
        p_admin_id: admin.id,
        p_admin_notes: admin_notes || null,
        p_resolution_notes: resolution_notes || null,
      });

      if (error) {
        console.error('Automatic warranty stock delivery failed:', error);
        const databaseMessage = [error.message || '', error.details || ''].join(' ');

        if (databaseMessage.includes('STOK_PENGGANTI_TIDAK_TERSEDIA')) {
          return NextResponse.json(
            { error: 'Stok pengganti untuk produk ini sedang tidak tersedia. Tambahkan stok aktif terlebih dahulu; klaim tetap berstatus Menunggu Peninjauan.' },
            { status: 409 },
          );
        }

        if (databaseMessage.includes('ASSIGNMENT_AKUN_LAMA_TIDAK_DITEMUKAN')) {
          return NextResponse.json(
            { error: 'Assignment akun yang dilaporkan tidak ditemukan atau sudah tidak aktif. Klaim belum diubah.' },
            { status: 409 },
          );
        }

        if (databaseMessage.includes('KLAIM_TIDAK_DITEMUKAN')) {
          return NextResponse.json({ error: 'Klaim tidak ditemukan' }, { status: 404 });
        }

        if (databaseMessage.includes('STATUS_KLAIM_TIDAK_DAPAT_DISETUJUI')) {
          return NextResponse.json({ error: 'Status klaim ini tidak dapat diterima.' }, { status: 409 });
        }

        return NextResponse.json(
          { error: 'Gagal mengambil dan mengirim akun dari stok. Klaim belum diubah.' },
          { status: 400 },
        );
      }

      return NextResponse.json(data);
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (status !== undefined) {
      updateData.status = status;
      updateData.resolved_at = status === 'pending' ? null : new Date().toISOString();
    }

    if (admin_notes !== undefined) updateData.admin_notes = admin_notes;

    if (resolution_notes !== undefined) {
      updateData.resolution_notes = resolution_notes;
    } else if (status === 'rejected') {
      updateData.resolution_notes = 'Klaim ditolak setelah peninjauan manual karena tidak memenuhi ketentuan garansi.';
    }

    if (gemini_invite_status !== undefined) {
      if (!claim.gemini_invite_email) {
        return NextResponse.json({ error: 'Email tujuan Gemini belum tersedia.' }, { status: 400 });
      }
      updateData.gemini_invite_status = gemini_invite_status;
      updateData.invite_processed_by_admin_id = admin.id;
      if (gemini_invite_status === 'invite_sent') {
        updateData.invite_sent_at = now;
        updateData.status = 'pending';
        updateData.resolved_at = null;
      } else if (gemini_invite_status === 'activated') {
        updateData.activation_confirmed_at = now;
        updateData.status = 'approved';
        updateData.resolved_at = now;
      } else {
        updateData.status = 'pending';
        updateData.resolved_at = null;
      }
    }

    const { data, error } = await supabase
      .from('warranty_claims')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
