export type DiscountType = 'fixed' | 'percentage';
export type FixedDiscountMode = 'per_item' | 'per_order';

export interface DiscountPricingRule {
  discount_type: DiscountType | string;
  discount_value: number | string;
  min_quantity?: number | string | null;
  fixed_discount_mode?: FixedDiscountMode | string | null;
}

export interface DiscountCalculation {
  discountAmount: number;
  finalPrice: number;
  minQuantity: number;
  fixedDiscountMode: FixedDiscountMode;
}

export const MAX_ORDER_QUANTITY = 10;

export function normalizeOrderQuantity(value: unknown): number {
  return Math.min(MAX_ORDER_QUANTITY, Math.max(1, Math.floor(Number(value) || 1)));
}

export function getMinimumQuantity(rule: DiscountPricingRule): number {
  return Math.min(
    MAX_ORDER_QUANTITY,
    Math.max(1, Math.floor(Number(rule.min_quantity) || 1)),
  );
}

export function getFixedDiscountMode(rule: DiscountPricingRule): FixedDiscountMode {
  return rule.fixed_discount_mode === 'per_order' ? 'per_order' : 'per_item';
}

export function calculateCampaignDiscount(
  rule: DiscountPricingRule,
  totalBasePrice: number,
  quantity: number,
): DiscountCalculation {
  const normalizedQuantity = normalizeOrderQuantity(quantity);
  const safeBasePrice = Math.max(0, Math.round(Number(totalBasePrice) || 0));
  const discountValue = Math.max(0, Number(rule.discount_value) || 0);
  const minQuantity = getMinimumQuantity(rule);
  const fixedDiscountMode = getFixedDiscountMode(rule);

  let discountAmount = 0;
  if (rule.discount_type === 'percentage') {
    discountAmount = Math.round(safeBasePrice * discountValue / 100);
  } else if (fixedDiscountMode === 'per_order') {
    discountAmount = Math.round(discountValue);
  } else {
    discountAmount = Math.round(discountValue * normalizedQuantity);
  }

  discountAmount = Math.min(discountAmount, safeBasePrice);

  return {
    discountAmount,
    finalPrice: safeBasePrice - discountAmount,
    minQuantity,
    fixedDiscountMode,
  };
}
