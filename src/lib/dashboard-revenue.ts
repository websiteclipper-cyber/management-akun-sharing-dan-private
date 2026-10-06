const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function jakartaDateKey(value: string | Date): string {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    ? new Date(timestamp + WIB_OFFSET_MS).toISOString().slice(0, 10)
    : '';
}

export function buildRevenueHistory(
  orders: { created_at: string; payment_status: string; total_amount: number | null }[],
  now = new Date(),
) {
  const today = jakartaDateKey(now);
  const end = Date.parse(`${today}T00:00:00Z`);
  let start = end - 29 * DAY_MS;
  const totals = new Map<string, { revenue: number; orders: number }>();

  for (const order of orders) {
    if (order.payment_status !== 'paid') continue;
    const key = jakartaDateKey(order.created_at);
    if (!key || key > today) continue;
    start = Math.min(start, Date.parse(`${key}T00:00:00Z`));
    const total = totals.get(key) || { revenue: 0, orders: 0 };
    total.revenue += Number(order.total_amount || 0);
    total.orders++;
    totals.set(key, total);
  }

  return Array.from({ length: Math.round((end - start) / DAY_MS) + 1 }, (_, index) => {
    const date = new Date(start + index * DAY_MS);
    const dateKey = date.toISOString().slice(0, 10);
    return {
      dateKey,
      date: date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      ...(totals.get(dateKey) || { revenue: 0, orders: 0 }),
    };
  });
}
