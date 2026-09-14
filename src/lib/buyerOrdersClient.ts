import { supabase } from '@/lib/supabase';

export class BuyerOrdersError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'BuyerOrdersError';
  }
}

const SESSION_EXPIRED_MESSAGE = 'Sesi login sudah berakhir. Silakan masuk kembali dengan email yang digunakan saat memesan.';
const LOAD_ERROR_MESSAGE = 'Riwayat pesanan gagal dimuat. Silakan coba lagi.';

export async function fetchBuyerOrders(): Promise<Array<Record<string, unknown>>> {
  const requestOrders = (token: string) => fetch('/api/buyer/orders', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  let response = await requestOrders(localStorage.getItem('buyer_token') || '');

  // Supabase refreshes its own session, but the application's 24-hour buyer
  // token must be renewed separately through the server-verified exchange.
  if (response.status === 401) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw new BuyerOrdersError(LOAD_ERROR_MESSAGE, 503);
    if (!session?.access_token) throw new BuyerOrdersError(SESSION_EXPIRED_MESSAGE, 401);

    const exchange = await fetch('/api/buyer/auth/exchange', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const refreshed = await exchange.json();
    if (!exchange.ok) {
      throw new BuyerOrdersError(
        exchange.status === 401 ? SESSION_EXPIRED_MESSAGE : refreshed.error || LOAD_ERROR_MESSAGE,
        exchange.status,
      );
    }
    if (refreshed.needs_profile || !refreshed.token || !refreshed.buyer) {
      throw new BuyerOrdersError(SESSION_EXPIRED_MESSAGE, 401);
    }

    localStorage.setItem('buyer_token', refreshed.token);
    localStorage.setItem('buyer_session', JSON.stringify(refreshed.buyer));
    response = await requestOrders(refreshed.token);
  }

  if (!response.ok) {
    const data = await response.json();
    throw new BuyerOrdersError(
      response.status === 401 ? SESSION_EXPIRED_MESSAGE : data.error || LOAD_ERROR_MESSAGE,
      response.status,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data.orders)) throw new BuyerOrdersError(LOAD_ERROR_MESSAGE, 502);
  return data.orders;
}
