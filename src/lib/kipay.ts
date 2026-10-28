// Server-side only. Official contract: https://kipay.id/docs/api
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface KiPayTransaction {
  trx_id: string;
  mode: 'sandbox' | 'production';
  requested_amount: number;
  amount: number;
  status: 'pending' | 'paid' | 'expired';
  note: string | null;
  expires_at: string;
  matched_at: string | null;
  qr_payload: string | null;
}

export class KiPayApiError extends Error {
  constructor(readonly httpStatus: number) {
    super(`KiPay menolak permintaan pembayaran (HTTP ${httpStatus}).`);
    this.name = 'KiPayApiError';
  }
}

export function getKiPayConfig() {
  const apiKey = process.env.KIPAY_API_KEY?.trim();
  const mode = process.env.KIPAY_ENV?.trim() || 'sandbox';
  if (!apiKey) throw new Error('KIPAY_API_KEY belum dikonfigurasi di server.');
  if (!['sandbox', 'production'].includes(mode)) throw new Error('KIPAY_ENV tidak valid.');
  return { apiKey, mode };
}

async function apiRequest(path: string, init: RequestInit = {}) {
  const { apiKey } = getKiPayConfig();
  let response: Response;
  try {
    response = await fetch(`https://api.kipay.id/api/pay/${encodeURIComponent(apiKey)}/transactions${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Neither upstream bodies nor fetch errors are safe to log: the URL contains the API key.
    throw new Error('Layanan KiPay belum dapat dihubungi. Coba periksa status kembali.');
  }
  if (!response.ok) throw new KiPayApiError(response.status);
  return response;
}

export function normalizeKiPayTransaction(value: unknown): KiPayTransaction {
  if (!value || typeof value !== 'object') throw new Error('Respons KiPay tidak valid.');
  const body = value as Record<string, unknown>;
  const { mode } = getKiPayConfig();
  if (typeof body.trx_id !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(body.trx_id)
    || body.mode !== mode || !['pending', 'paid', 'expired'].includes(String(body.status))
    || !Number.isSafeInteger(body.requested_amount) || Number(body.requested_amount) <= 0
    || !Number.isSafeInteger(body.amount) || Number(body.amount) < Number(body.requested_amount)
    || typeof body.expires_at !== 'string'
    || (body.note !== null && typeof body.note !== 'string')) {
    throw new Error('Data atau environment transaksi KiPay tidak sesuai.');
  }
  // Allowlist only. In particular, qr_url contains the secret API key.
  return {
    trx_id: body.trx_id,
    mode: body.mode as KiPayTransaction['mode'],
    requested_amount: Number(body.requested_amount),
    amount: Number(body.amount),
    status: body.status as KiPayTransaction['status'],
    note: body.note as string | null,
    expires_at: body.expires_at,
    matched_at: typeof body.matched_at === 'string' ? body.matched_at : null,
    qr_payload: typeof body.qr_payload === 'string' ? body.qr_payload : null,
  };
}

async function readTransaction(response: Response) {
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('Respons KiPay tidak valid.'); }
  return normalizeKiPayTransaction(body);
}

export async function createKiPayTransaction(orderNumber: string, amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Nominal order tidak valid.');
  const transaction = await readTransaction(await apiRequest('', {
    method: 'POST', body: JSON.stringify({ amount, note: orderNumber }),
  }));
  if (transaction.requested_amount !== amount || transaction.note !== orderNumber || transaction.status !== 'pending') {
    throw new Error('Transaksi KiPay tidak sesuai dengan pesanan.');
  }
  return transaction;
}

export async function getKiPayTransaction(transactionId: string) {
  const transaction = await readTransaction(await apiRequest(`/${encodeURIComponent(transactionId)}`));
  if (transaction.trx_id !== transactionId) throw new Error('Referensi transaksi KiPay tidak sesuai.');
  return transaction;
}

export async function getKiPayQrImage(transactionId: string): Promise<string> {
  try {
    const response = await apiRequest(`/${encodeURIComponent(transactionId)}/qr.png`, {
      headers: { Accept: 'image/png' },
    });
    if (!response.headers.get('content-type')?.startsWith('image/png')) throw new Error('Gambar QRIS KiPay tidak valid.');
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length > 1_000_000 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error('Gambar QRIS KiPay tidak valid.');
    }
    return `data:image/png;base64,${image.toString('base64')}`;
  } catch {
    throw new Error('Gambar QRIS KiPay belum dapat dimuat. Silakan muat ulang halaman.');
  }
}

export function verifyKiPayWebhook(rawBody: string, headers: Headers, now = Date.now()): boolean {
  const secret = process.env.KIPAY_WEBHOOK_SECRET?.trim();
  const timestamp = headers.get('x-webhook-timestamp') || '';
  const delivery = headers.get('x-webhook-delivery') || '';
  const signature = headers.get('x-webhook-signature') || '';
  const sentAt = Date.parse(timestamp);
  if (!secret || !delivery || !Number.isFinite(sentAt) || Math.abs(now - sentAt) > 300_000
    || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${delivery}.${rawBody}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}
