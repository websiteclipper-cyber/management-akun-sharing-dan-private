import { NextRequest, NextResponse } from 'next/server';
import { getBuyerFromRequest } from '@/lib/auth';
import { supabaseAdmin as supabase } from '@/lib/supabase';

// Buyer data must be fetched through this route, never directly with the
// browser's Supabase key. The token is bound to one buyer_id server-side.
export async function GET(request: NextRequest) {
  const buyer = getBuyerFromRequest(request);
  if (!buyer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestedOrder = request.nextUrl.searchParams.get('order');
  let ordersQuery = supabase
    .from('orders')
    .select('*, product:products(*)')
    .eq('buyer_id', buyer.id)
    .order('created_at', { ascending: false });

  if (requestedOrder) {
    ordersQuery = ordersQuery.eq('order_number', requestedOrder);
  }

  const { data: orders, error: ordersError } = await ordersQuery;
  if (ordersError) {
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
  }

  const orderIds = (orders || []).map((order) => order.id);
  if (orderIds.length === 0) {
    return NextResponse.json({ orders: [] });
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from('account_assignments')
    .select(`
      *,
      stock_account:stock_accounts(
        id,
        account_identifier,
        account_secret_encrypted,
        account_type,
        profile_info,
        pin_info
      )
    `)
    .in('order_id', orderIds)
    .eq('status', 'active');

  if (assignmentsError) {
    return NextResponse.json({ error: 'Failed to load assignments' }, { status: 500 });
  }

  const assignmentsByOrder = new Map<number, typeof assignments>();
  for (const assignment of assignments || []) {
    const existing = assignmentsByOrder.get(assignment.order_id) || [];
    existing.push(assignment);
    assignmentsByOrder.set(assignment.order_id, existing);
  }

  return NextResponse.json({
    orders: (orders || []).map((order) => ({
      ...order,
      assignments: assignmentsByOrder.get(order.id) || [],
    })),
  });
}
