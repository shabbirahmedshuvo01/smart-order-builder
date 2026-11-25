export interface MenuOption {
  id: string;
  name: string;
  pricePoisha: number;
  ingredients: Record<string, number>;
}

export interface OptionGroup {
  id: string;
  name: string;
  min: number;
  max: number;
  step?: number;
  maxDistinct?: number;
  maxPerOption?: number;
  options: MenuOption[];
}

export interface RequiresRule {
  id: string;
  type: 'requires';
  optionId: string;
  requiredAnyOf: string[];
  message: string;
}

export interface ExcludesRule {
  id: string;
  type: 'excludes';
  optionId: string;
  excludedOptions: string[];
  message: string;
}

export interface OverrideLimitRule {
  id: string;
  type: 'overrideLimit';
  triggerOptionId: string;
  targetGroupId: string;
  max: number;
  message: string;
}

export type CrossGroupRule = RequiresRule | ExcludesRule | OverrideLimitRule;

export interface ThresholdFlatPromo {
  id: string;
  type: 'threshold_flat';
  minSubtotalPoisha: number;
  discountPoisha: number;
}

export interface CouponPercentCapPromo {
  id: string;
  type: 'coupon_percent_cap';
  code: string;
  percent: number;
  maxDiscountPoisha: number;
  validBeforeHourDhaka: number;
}

export type PromoRule = ThresholdFlatPromo | CouponPercentCapPromo;

export interface MenuFixture {
  basePricePoisha: number;
  vatRatePercent: number;
  reservationTtlSeconds: number;
  groups: OptionGroup[];
  rules: CrossGroupRule[];
  initialStock: Record<string, number>;
  promos: PromoRule[];
}

export interface ItemConfig {
  selections: Record<string, number>;
  quantity: number;
}

export interface RuleViolation {
  id: string;
  groupId?: string;
  message: string;
}

export interface IngredientShortage {
  ingredient: string;
  shortBy: number;
}

export interface CartLine {
  id: string;
  config: ItemConfig;
  quantity?: number;
  unitPricePoisha?: number;
  lineTotalPoisha?: number;
  reservationId?: string;
  expired?: boolean;
  expiresAtIso?: string;
}

export interface ReservationResult {
  ok: boolean;
  line?: CartLine;
  reservation?: Reservation;
  shortages?: IngredientShortage[];
  message?: string;
  deduplicated?: boolean;
  expired?: boolean;
}

export interface CheckoutResult {
  ok: boolean;
  order?: StoredOrder;
  message?: string;
  deduplicated?: boolean;
  expired?: boolean;
}

export interface StoreState {
  cart: CartLine[];
  reservations: Reservation[];
  remainingStock: Record<string, number>;
  serverTime: string;
}

export interface PricingBreakdown {
  subtotalPoisha: number;
  appliedPromoCode: string | null;
  discountPoisha: number;
  discountedSubtotalPoisha: number;
  vatPoisha: number;
  payableBdt: number;
  couponEntered: string | null;
  couponApplied: string | null;
  couponRejectedReason: string | null;
  lines?: Array<{
    lineId: string;
    unitPricePoisha: number;
    lineTotalPoisha: number;
  }>;
}

export interface Reservation {
  id: string;
  cartLineId: string;
  ingredients: Record<string, number>;
  createdAtIso: string;
  expiresAtIso: string;
}

export interface StoredOrder {
  id: string;
  createdAt: string;
  paymentMethod: string;
  coupon: {
    enteredCode: string | null;
    appliedCode: string | null;
    rejectedReason: string | null;
  };
  items: Array<{
    lineId: string;
    quantity: number;
    selections: Record<string, any>;
    unitPricePoisha: number;
    lineTotalPoisha: number;
  }>;
  pricing: {
    subtotalPoisha: number;
    appliedPromoCode: string | null;
    discountPoisha: number;
    discountedSubtotalPoisha: number;
    vatPoisha: number;
    payableBdt: number;
  };
}
