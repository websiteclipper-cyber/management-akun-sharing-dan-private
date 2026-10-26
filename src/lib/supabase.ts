import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// ============================================================
// SERVICE ROLE CLIENT (Server-side only — bypasses RLS)
// Use in: API routes, webhooks, cron jobs
// NEVER expose this to the browser!
// ============================================================
let _adminClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Server Supabase configuration is missing.');
  }
  if (!supabaseServiceKey.startsWith('sb_secret_')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must contain a secret API key (sb_secret_...).');
  }
  _adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _adminClient;
}

// Alias for convenience in API routes
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop: string) {
    const client = getServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

// ============================================================
// ANON CLIENT (Client-side — subject to RLS)
// Use in: React components, browser-side code
// ============================================================
let _supabase: SupabaseClient | null = null;

function getDefaultClient(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables.');
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// Use this in client components: import { supabase } from '@/lib/supabase'
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop: string) {
    const client = getDefaultClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

// Legacy exports for compatibility
export function createServerClient() {
  return getServiceClient();
}

export function getSupabaseClient() {
  return getDefaultClient();
}
