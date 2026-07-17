import { supabaseAdmin } from '@/lib/supabase';

export interface BuyerProfileRecord {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
}

export async function findBuyerByVerifiedEmail(email: string): Promise<BuyerProfileRecord | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: exactBuyer, error: exactError } = await supabaseAdmin
    .from('buyers')
    .select('id, name, email, phone, status')
    .eq('email', normalizedEmail)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (exactError) throw exactError;
  if (exactBuyer) return exactBuyer as BuyerProfileRecord;

  // Legacy rows may contain mixed-case email addresses. Avoid ILIKE here:
  // email addresses can legally contain '_' and '%', which are wildcard
  // characters in LIKE patterns. Compare normalized values in trusted server
  // code instead so one verified email cannot match another buyer by pattern.
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: pageData, error: pageError } = await supabaseAdmin
      .from('buyers')
      .select('id, name, email, phone, status')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (pageError) throw pageError;

    const rows = (pageData || []) as BuyerProfileRecord[];
    const buyer = rows.find((row) => row.email?.trim().toLowerCase() === normalizedEmail);
    if (buyer) return buyer;
    if (rows.length < pageSize) break;
  }

  return null;
}
