// KlikQRIS Payment Gateway integration (server-side only)
// Official docs: https://klikqris.com/dokumentasi-api

const KLIKQRIS_PRODUCTION_BASE_URL = 'https://klikqris.com/api';
const KLIKQRIS_SANDBOX_BASE_URL = 'https://klikqris.com/api/sandbox';

export type KlikQrisTransactionStatus = 'PENDING' | 'SUCCESS' | 'EXPIRED';

export interface KlikQrisTransaction {
  order_id: string;
  amount: string | number;
  total_amount: string | number;
  status: KlikQrisTransactionStatus;
  qris_url?: string | null;
  qris_image?: string | null;
  redirect_url?: string | null;
  expired_at?: string | null;
  paid_at?: string | null;
  signature: string;
  keterangan?: string | null;
}

interface KlikQrisResponse {
  status: boolean;
  message?: string;
  data?: KlikQrisTransaction;
}

export interface NormalizedKlikQrisWebhook {
  orderId: string;
  status: string;
  amount: number;
  totalAmount: number;
  paidAt: string | null;
  signature: string;
  paymentMethod: string;
  raw: Record<string, unknown>;
}

function getConfig() {
  const apiKey = process.env.KLIKQRIS_API_KEY?.trim();
  const merchantId = process.env.KLIKQRIS_MERCHANT_ID?.trim();
  const environment = process.env.KLIKQRIS_ENV === 'production' ? 'production' : 'sandbox';

  if (!apiKey || !merchantId) {
    throw new Error('KLIKQRIS_API_KEY dan KLIKQRIS_MERCHANT_ID wajib dikonfigurasi di server.');
  }

  return {
    apiKey,
    merchantId,
    baseUrl: environment === 'production' ? KLIKQRIS_PRODUCTION_BASE_URL : KLIKQRIS_SANDBOX_BASE_URL,
  };
}

function getHeaders(apiKey: string, merchantId: string) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    id_merchant: merchantId,
  };
}

async function parseResponse(response: Response): Promise<KlikQrisResponse> {
  const raw = await response.text();
  let body: KlikQrisResponse;

  try {
    body = JSON.parse(raw) as KlikQrisResponse;
  } catch {
    throw new Error(`KlikQRIS mengembalikan respons tidak valid (HTTP ${response.status}).`);
  }

  if (!response.ok || !body.status || !body.data) {
    throw new Error(body.message || `KlikQRIS API error (HTTP ${response.status}).`);
  }

  return body;
}

export async function createKlikQrisTransaction(
  orderId: string,
  amount: number,
  description: string,
): Promise<KlikQrisTransaction> {
  const { apiKey, merchantId, baseUrl } = getConfig();
  const callbackUrl = process.env.KLIKQRIS_CALLBACK_URL?.trim()
    || 'https://pastipremium.my.id/api/webhooks/klikqris';

  const response = await fetch(`${baseUrl}/qris/create`, {
    method: 'POST',
    headers: getHeaders(apiKey, merchantId),
    cache: 'no-store',
    body: JSON.stringify({
      order_id: orderId,
      id_merchant: merchantId,
      amount: Math.round(amount),
      keterangan: description,
      callback_url: callbackUrl,
    }),
  });

  const body = await parseResponse(response);
  const transaction = body.data!;

  if (!transaction.signature || !transaction.order_id || !transaction.total_amount) {
    throw new Error('Respons pembuatan transaksi KlikQRIS tidak lengkap.');
  }

  return transaction;
}

export async function getKlikQrisTransaction(orderId: string): Promise<KlikQrisTransaction> {
  const { apiKey, merchantId, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}/qris/status/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: getHeaders(apiKey, merchantId),
    cache: 'no-store',
  });

  const body = await parseResponse(response);
  return body.data!;
}

export function normalizeKlikQrisWebhook(payload: unknown): NormalizedKlikQrisWebhook | null {
  if (!payload || typeof payload !== 'object') return null;

  const raw = payload as Record<string, unknown>;
  const nested = raw.data && typeof raw.data === 'object'
    ? raw.data as Record<string, unknown>
    : raw;

  const orderId = String(nested.order_id || raw.order_id || '').trim();
  const status = String(nested.status || raw.status || '').trim().toUpperCase();
  const amount = Number(nested.amount_request ?? nested.amount ?? raw.amount ?? 0);
  const totalAmount = Number(nested.amount_paid ?? nested.total_amount ?? raw.total_amount ?? 0);
  const signature = String(nested.signature || raw.signature || '').trim();
  const paidAtValue = nested.payment_date || nested.paid_at || raw.payment_date || raw.paid_at;
  const paymentMethod = String(nested.via || raw.via || 'QRIS').trim().toUpperCase();

  if (!orderId || !status || !signature || !Number.isFinite(amount) || !Number.isFinite(totalAmount)) {
    return null;
  }

  return {
    orderId,
    status,
    amount,
    totalAmount,
    paidAt: paidAtValue ? String(paidAtValue) : null,
    signature,
    paymentMethod,
    raw,
  };
}

export function signaturesMatch(expected: string, received: string): boolean {
  if (!expected || !received || expected.length !== received.length) return false;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return mismatch === 0;
}

