import { unstable_cache } from 'next/cache';
import type { Product } from '@/lib/types';
import { getServiceClient } from '@/lib/supabase';
import { getAvailableStockByProductIds } from '@/lib/product-stock';
import { DEFAULT_MAINTENANCE_ANNOUNCEMENT } from '@/lib/maintenance';

export interface PublicPromo {
  id: string;
  product_id: number;
  promo_label: string;
  original_price: number;
  promo_price: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface PublicLeaderboardEntry {
  mitra_name: string;
  commission_today: number;
  rank_position: number;
  avatar_emoji: string;
}

export interface PublicCatalogData {
  products: Product[];
  promos: PublicPromo[];
  error: boolean;
}

const PUBLIC_SETTING_KEYS = [
  'support_whatsapp',
  'maintenance_mode',
  'maintenance_announcement',
  'maintenance_whatsapp_group',
  'global_promo_active',
  'global_promo_platform',
  'global_promo_title',
  'global_promo_subtitle',
  'global_promo_badge',
  'global_promo_normal_price',
  'global_promo_price',
  'global_promo_btn_text',
  'global_promo_btn_link',
];

const PUBLIC_QUERY_TIMEOUT_MS = 5_000;
const CATALOG_QUERY_TIMEOUT_MS = 15_000;

async function queryPublicCatalog(): Promise<PublicCatalogData> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  // One deadline for the entire catalog, including all stock pages.
  const signal = AbortSignal.timeout(CATALOG_QUERY_TIMEOUT_MS);
  const [productResult, promoResult] = await Promise.all([
    supabase
      .from('products')
      .select('id, code, name, platform_name, catalog_category, account_type, price, newcomer_price, duration_days, warranty_days, description, terms, status, created_at, updated_at, default_max_slot')
      .in('status', ['active', 'inactive'])
      .order('platform_name', { ascending: true })
      .abortSignal(signal),
    supabase
      .from('promos')
      .select('id, product_id, promo_label, original_price, promo_price, start_date, end_date, is_active')
      .eq('is_active', true)
      .lte('start_date', now)
      .gte('end_date', now)
      .abortSignal(signal),
  ]);

  if (productResult.error) throw productResult.error;
  if (promoResult.error) throw promoResult.error;

  const products = (productResult.data || []) as Product[];
  const stockByProduct = await getAvailableStockByProductIds(
    products.map((product) => product.id),
    signal,
  );

  return {
    products: products.map((product) => ({
      ...product,
      available_stock: stockByProduct.get(product.id) || 0,
    })),
    promos: (promoResult.data || []) as PublicPromo[],
    error: false,
  };
}

// Display-only cache: checkout/payment still validate current prices and stock.
const getCachedPublicCatalog = unstable_cache(
  queryPublicCatalog,
  ['public-home-catalog'],
  { revalidate: 30, tags: ['public-home-catalog'] },
);

export async function getPublicCatalog(): Promise<PublicCatalogData> {
  try {
    return await getCachedPublicCatalog();
  } catch {
    // Handle failure outside the cache: never store an outage as an empty
    // catalog or replace the last successful snapshot with an error result.
    return { products: [], promos: [], error: true };
  }
}

async function queryPublicSettings(): Promise<Record<string, string>> {
  const defaults = {
    support_whatsapp: '082244046330',
    maintenance_mode: 'false',
    maintenance_announcement: DEFAULT_MAINTENANCE_ANNOUNCEMENT,
    maintenance_whatsapp_group: '',
  };

  try {
    const { data, error } = await getServiceClient()
      .from('site_settings')
      .select('key, value')
      .in('key', PUBLIC_SETTING_KEYS)
      .abortSignal(AbortSignal.timeout(PUBLIC_QUERY_TIMEOUT_MS));

    if (error || !data) return defaults;
    return data.reduce<Record<string, string>>((settings, row) => {
      settings[row.key] = row.value;
      return settings;
    }, { ...defaults });
  } catch {
    return defaults;
  }
}

export const getPublicSettings = unstable_cache(
  queryPublicSettings,
  ['public-home-settings'],
  { revalidate: 30, tags: ['public-home-settings'] },
);

async function queryPublicLeaderboard(): Promise<PublicLeaderboardEntry[]> {
  try {
    const { data, error } = await getServiceClient()
      .from('dummy_leaderboard')
      .select('mitra_name, commission_today, rank_position, avatar_emoji')
      .eq('is_active', true)
      .order('rank_position', { ascending: true })
      .limit(10)
      .abortSignal(AbortSignal.timeout(PUBLIC_QUERY_TIMEOUT_MS));
    return error ? [] : (data || []) as PublicLeaderboardEntry[];
  } catch {
    return [];
  }
}

export const getPublicLeaderboard = unstable_cache(
  queryPublicLeaderboard,
  ['public-home-leaderboard'],
  { revalidate: 300, tags: ['public-home-leaderboard'] },
);
