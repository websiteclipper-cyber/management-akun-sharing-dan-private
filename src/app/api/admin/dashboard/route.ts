import { NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/auth';
import { supabaseAdmin as supabase } from '@/lib/supabase';

interface DashboardOrder {
  id: number;
  order_number: string;
  total_amount: number | null;
  order_status: string;
  payment_status: string;
  created_at: string;
  product_id: number | null;
  buyer: { name?: string | null; phone?: string | null } | null;
  product: { name?: string | null; platform_name?: string | null } | null;
}

export async function GET(request: Request) {
  if (!(await getAdminFromRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [productsResult, stockResult, ticketsResult, buyersResult, warrantyResult] = await Promise.all([
    supabase.from('products').select('id, status'),
    supabase.from('stock_accounts').select('id, status, account_type'),
    supabase.from('support_tickets').select('id, status'),
    supabase.from('buyers').select('id', { count: 'exact', head: true }),
    supabase.from('warranty_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  if (productsResult.error || stockResult.error || ticketsResult.error || buyersResult.error || warrantyResult.error) {
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }

  // Supabase limits a select response to 1,000 rows by default. Fetch every
  // page so revenue, recent dates, and order totals do not silently stop at
  // the first 1,000 orders.
  const orders: DashboardOrder[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: orderPage, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, order_status, payment_status, created_at, product_id, buyer:buyers(name, phone), product:products(name, platform_name)')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (orderError) {
      return NextResponse.json({ error: 'Failed to load dashboard orders' }, { status: 500 });
    }

    const rows = (orderPage || []) as unknown as DashboardOrder[];
    orders.push(...rows);
    if (rows.length < pageSize) break;
  }

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const paidOrders = orders.filter((order) => order.payment_status === 'paid');
  const last30Paid = paidOrders.filter((order) => new Date(order.created_at) >= thirtyDaysAgo);
  const todayOrders = orders.filter((order) => new Date(order.created_at) >= today);
  const todayPaid = paidOrders.filter((order) => new Date(order.created_at) >= today);

  const productMap: Record<number, { name: string; count: number; revenue: number }> = {};
  for (const order of paidOrders) {
    if (!order.product_id) continue;
    const product = order.product;
    const row = productMap[order.product_id] || { name: product?.name || `Product #${order.product_id}`, count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += Number(order.total_amount || 0);
    productMap[order.product_id] = row;
  }

  const dailyRevenue = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    const dayOrders = last30Paid.filter((order) => {
      const createdAt = new Date(order.created_at);
      return createdAt >= date && createdAt < nextDate;
    });
    return {
      date: date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
      revenue: dayOrders.reduce((total, order) => total + Number(order.total_amount || 0), 0),
      orders: dayOrders.length,
    };
  });

  const statuses = ['pending', 'paid', 'assigned', 'delivered', 'completed', 'cancelled', 'refunded', 'pending_payment', 'failed'];
  const statusBreakdown = Object.fromEntries(statuses.map((status) => [
    status,
    orders.filter((order) => order.order_status === status).length,
  ]));
  const stock = stockResult.data || [];

  return NextResponse.json({
    totalRevenue: paidOrders.reduce((total, order) => total + Number(order.total_amount || 0), 0),
    totalOrders: orders.length,
    totalBuyers: buyersResult.count || 0,
    totalStockActive: stock.filter((account) => account.status === 'active').length,
    revenueToday: todayPaid.reduce((total, order) => total + Number(order.total_amount || 0), 0),
    ordersToday: todayOrders.length,
    paidToday: todayPaid.length,
    pendingPayment: orders.filter((order) => order.payment_status === 'pending_payment').length,
    needsAssignment: orders.filter((order) => order.payment_status === 'paid' && order.order_status === 'paid').length,
    openTickets: (ticketsResult.data || []).filter((ticket) => ['open', 'in_progress'].includes(ticket.status)).length,
    pendingWarrantyClaims: warrantyResult.count || 0,
    totalActiveProducts: (productsResult.data || []).filter((product) => product.status === 'active').length,
    sharingAvailable: stock.filter((account) => account.status === 'active' && account.account_type === 'sharing').length,
    privateAvailable: stock.filter((account) => account.status === 'active' && account.account_type === 'private').length,
    fullAccounts: stock.filter((account) => account.status === 'full').length,
    recentOrders: [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
    topProducts: Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    dailyRevenue,
    statusBreakdown,
  });
}
