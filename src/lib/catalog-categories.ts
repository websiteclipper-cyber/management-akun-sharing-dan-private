import type { CatalogCategory, Product } from '@/lib/types';

export const CATALOG_CATEGORIES = [
  {
    id: 'ai_productivity',
    title: '🤖 AI & Produktivitas',
    label: 'AI & Produktivitas',
    description: 'AI, asisten kerja, coding, riset, dan produktivitas.',
  },
  {
    id: 'editing_design',
    title: '🎨 Editing & Desain',
    label: 'Editing & Desain',
    description: 'Desain grafis, foto, video, dan alat editing.',
  },
  {
    id: 'music_audio',
    title: '🎵 Musik & Audio',
    label: 'Musik & Audio',
    description: 'Streaming musik, podcast, dan layanan audio.',
  },
  {
    id: 'streaming_entertainment',
    title: '🍿 Streaming & Hiburan',
    label: 'Streaming & Hiburan',
    description: 'Film, serial, video, dan layanan hiburan.',
  },
  {
    id: 'other',
    title: '📦 Kategori Lainnya',
    label: 'Kategori Lainnya',
    description: 'Produk yang tidak sesuai dengan kategori utama di atas.',
  },
] as const;

export type CatalogCategoryId = CatalogCategory;

const CATEGORY_KEYWORDS: Record<Exclude<CatalogCategoryId, 'other'>, string[]> = {
  ai_productivity: [
    'CHATGPT', 'CLAUDE', 'GEMINI', 'GROK', 'LEONARDO', 'NOTION', 'LOVABLE',
    'GOOGLE', 'DEEPSEEK', 'PERPLEXITY', 'MIDJOURNEY', 'CURSOR', 'COPILOT', 'BLACKBOX',
  ],
  editing_design: ['CANVA', 'CAPCUT', 'WINK', 'ADOBE', 'FIGMA', 'PICSART'],
  music_audio: ['SPOTIFY', 'APPLE MUSIC', 'SOUNDCLOUD', 'TIDAL'],
  streaming_entertainment: ['NETFLIX', 'YOUTUBE', 'DISNEY', 'VIDIO', 'VIU', 'PRIME', 'HBO', 'IQIYI', 'WE TV'],
};

export function isCatalogCategory(value: unknown): value is CatalogCategoryId {
  return CATALOG_CATEGORIES.some(category => category.id === value);
}

export function inferCatalogCategory(platformName: string): CatalogCategoryId {
  const normalizedName = platformName.trim().toUpperCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => normalizedName.includes(keyword))) {
      return category as CatalogCategoryId;
    }
  }

  return 'other';
}

export function getProductCatalogCategory(
  product: Pick<Product, 'platform_name' | 'catalog_category'> | null | undefined,
): CatalogCategoryId {
  if (product && isCatalogCategory(product.catalog_category)) {
    return product.catalog_category;
  }

  return inferCatalogCategory(product?.platform_name || '');
}

export function getCatalogCategoryLabel(categoryId: CatalogCategoryId | null | undefined): string {
  return CATALOG_CATEGORIES.find(category => category.id === categoryId)?.label || 'Kategori Lainnya';
}
