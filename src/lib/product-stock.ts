import 'server-only';

import { getServiceClient } from '@/lib/supabase';

interface StockCapacityRow {
  id: number;
  product_id: number;
  max_slot: number | null;
  current_used_slot: number | null;
}

const STOCK_PAGE_SIZE = 1000;

function toNonNegativeInteger(value: number | null): number {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.trunc(numericValue));
}

export function calculateAvailableStock(
  productIds: number[],
  rows: StockCapacityRow[],
): Map<number, number> {
  const stockByProduct = new Map<number, number>();

  for (const productId of productIds) {
    if (Number.isInteger(productId) && productId > 0) {
      stockByProduct.set(productId, 0);
    }
  }

  for (const row of rows) {
    if (!stockByProduct.has(row.product_id)) continue;

    const remainingSlots = Math.max(
      0,
      toNonNegativeInteger(row.max_slot) - toNonNegativeInteger(row.current_used_slot),
    );
    stockByProduct.set(
      row.product_id,
      (stockByProduct.get(row.product_id) || 0) + remainingSlots,
    );
  }

  return stockByProduct;
}

export async function getAvailableStockByProductIds(
  productIds: number[],
): Promise<Map<number, number>> {
  const uniqueProductIds = [...new Set(
    productIds.filter((productId) => Number.isInteger(productId) && productId > 0),
  )];

  if (uniqueProductIds.length === 0) return new Map();

  const supabase = getServiceClient();
  const stockRows: StockCapacityRow[] = [];

  for (let from = 0; ; from += STOCK_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('stock_accounts')
      .select('id, product_id, max_slot, current_used_slot')
      .in('product_id', uniqueProductIds)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, from + STOCK_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Gagal membaca stok produk: ${error.message}`);
    }

    const page = (data || []) as StockCapacityRow[];
    stockRows.push(...page);
    if (page.length < STOCK_PAGE_SIZE) break;
  }

  return calculateAvailableStock(uniqueProductIds, stockRows);
}

export async function getAvailableStock(productId: number): Promise<number> {
  const stockByProduct = await getAvailableStockByProductIds([productId]);
  return stockByProduct.get(productId) || 0;
}
