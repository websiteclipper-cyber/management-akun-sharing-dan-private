import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

const MAX_JSON_BYTES = 16 * 1024;
const localAttempts = new Map<string, { count: number; resetAt: number }>();
let rateLimitRpcAvailable = true;

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  ).slice(0, 128);
}

function getHashSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('API security secret is not configured.');
    }
    return 'development-only-rate-limit-secret';
  }
  return secret;
}

function hashKey(value: string): string {
  return crypto.createHmac('sha256', getHashSecret()).update(value).digest('hex');
}

export async function readJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes = MAX_JSON_BYTES,
): Promise<T> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('REQUEST_TOO_LARGE');

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new Error('UNSUPPORTED_CONTENT_TYPE');
  }

  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  return JSON.parse(text) as T;
}

export async function consumePublicRateLimit(
  request: Request,
  scope: string,
  options: { maxRequests: number; windowSeconds: number; subject?: string },
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  const keyHash = hashKey(`${scope}:${getClientIp(request)}:${options.subject || ''}`);
  if (rateLimitRpcAvailable) {
    const { data, error } = await supabaseAdmin.rpc('consume_public_api_rate_limit', {
      p_scope: scope,
      p_key_hash: keyHash,
      p_window_seconds: options.windowSeconds,
      p_max_requests: options.maxRequests,
    });

    if (!error && typeof data === 'boolean') {
      return { limited: !data, retryAfterSeconds: options.windowSeconds };
    }
    if (error?.code === 'PGRST202' || error?.code === '42883') {
      rateLimitRpcAvailable = false;
    }
  }

  // ponytail: per-instance fallback only covers deploys before migration runs;
  // remove after consume_public_api_rate_limit exists in every environment.
  const now = Date.now();
  if (localAttempts.size > 1000) {
    for (const [key, attempt] of localAttempts) {
      if (attempt.resetAt <= now) localAttempts.delete(key);
    }
  }
  const localKey = `${scope}:${keyHash}`;
  const current = localAttempts.get(localKey);
  if (!current || current.resetAt <= now) {
    localAttempts.set(localKey, { count: 1, resetAt: now + options.windowSeconds * 1000 });
    return { limited: false, retryAfterSeconds: options.windowSeconds };
  }

  current.count += 1;
  return {
    limited: current.count > options.maxRequests,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}
