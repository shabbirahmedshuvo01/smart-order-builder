import type {
  CartLine,
  ItemConfig,
  MenuFixture,
  MenuOption,
  PricingBreakdown,
  ThresholdFlatPromo,
  CouponPercentCapPromo,
} from '../types/order';

/**
 * Exact integer-based half-up rounding:
 * floor((numerator * 2 + denominator) / (2 * denominator))
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.floor((numerator * 2 + denominator) / (2 * denominator));
}

/**
 * Checks whether an ISO timestamp is strictly before a target hour in Asia/Dhaka.
 */
function isBeforeHourDhaka(serverTimeIso: string, targetHour: number): boolean {
  const date = new Date(serverTimeIso);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const second = parseInt(parts.find((p) => p.type === 'second')?.value ?? '0', 10);

  const totalSecondsDhaka = hour * 3600 + minute * 60 + second;
  const targetSecondsDhaka = targetHour * 3600;

  return totalSecondsDhaka < targetSecondsDhaka;
}

/**
 * Evaluates the unit price of an ItemConfig following Steps 1-3.
 */
export function priceItem(
  config: ItemConfig,
  menu: MenuFixture
): {
  unitPricePoisha: number;
  step1Poisha: number;
  step2Poisha: number;
  comboDiscountPoisha: number;
} {
  const optionMap = new Map<string, { option: MenuOption; groupId: string }>();
  for (const group of menu.groups) {
    for (const opt of group.options) {
      optionMap.set(opt.id, { option: opt, groupId: group.id });
    }
  }

  // Step 1: Unit subtotal = basePricePoisha + sum(option.pricePoisha * qty)
  let sumOptionsPoisha = 0;
  for (const [optionId, count] of Object.entries(config.selections || {})) {
    if (count <= 0) continue;
    const item = optionMap.get(optionId);
    if (item) {
      sumOptionsPoisha += item.option.pricePoisha * count;
    }
  }
  const step1Poisha = menu.basePricePoisha + sumOptionsPoisha;

  // Step 2: P2 Extras deal (per unit)
  // For extras group units, floor(totalExtraUnits / 3) cheapest extra units are free
  const extraPrices: number[] = [];
  for (const [optionId, count] of Object.entries(config.selections || {})) {
    if (count <= 0) continue;
    const item = optionMap.get(optionId);
    if (item && item.groupId === 'extras') {
      for (let i = 0; i < count; i++) {
        extraPrices.push(item.option.pricePoisha);
      }
    }
  }
  extraPrices.sort((a, b) => a - b);
  const freeExtraCount = Math.floor(extraPrices.length / 3);
  let extrasDiscountPoisha = 0;
  for (let i = 0; i < freeExtraCount; i++) {
    extrasDiscountPoisha += extraPrices[i];
  }
  const step2Poisha = step1Poisha - extrasDiscountPoisha;

  // Step 3: P1 Combo deal (per unit)
  // If eggs group total >= 4 AND protein group total >= 2, subtract roundHalfUp(step2Poisha * 10, 100)
  let eggUnits = 0;
  let proteinUnits = 0;
  for (const [optionId, count] of Object.entries(config.selections || {})) {
    if (count <= 0) continue;
    const item = optionMap.get(optionId);
    if (item) {
      if (item.groupId === 'eggs') {
        eggUnits += count;
      } else if (item.groupId === 'protein') {
        proteinUnits += count;
      }
    }
  }

  let comboDiscountPoisha = 0;
  if (eggUnits >= 4 && proteinUnits >= 2) {
    comboDiscountPoisha = roundHalfUp(step2Poisha * 10, 100);
  }
  const unitPricePoisha = step2Poisha - comboDiscountPoisha;

  return {
    unitPricePoisha,
    step1Poisha,
    step2Poisha,
    comboDiscountPoisha,
  };
}

/**
 * Prices a cart of items following Steps 1-6 strictly in integer poisha.
 */
export function priceCart(
  cart: CartLine[],
  menu: MenuFixture,
  couponCode: string | null,
  serverTimeIso: string
): PricingBreakdown {
  if (cart.length === 0) {
    return {
      subtotalPoisha: 0,
      appliedPromoCode: null,
      discountPoisha: 0,
      discountedSubtotalPoisha: 0,
      vatPoisha: 0,
      payableBdt: 0,
      couponEntered: couponCode,
      couponApplied: null,
      couponRejectedReason: null,
      lines: [],
    };
  }

  // Steps 1 - 4: Calculate line totals and cart subtotal
  let cartSubtotalPoisha = 0;
  const pricedLines: Array<{
    lineId: string;
    unitPricePoisha: number;
    lineTotalPoisha: number;
  }> = [];

  for (const line of cart) {
    const qty = line.quantity ?? line.config.quantity ?? 1;
    const itemPricing = priceItem(line.config, menu);
    const lineTotalPoisha = itemPricing.unitPricePoisha * qty;
    cartSubtotalPoisha += lineTotalPoisha;

    pricedLines.push({
      lineId: line.id,
      unitPricePoisha: itemPricing.unitPricePoisha,
      lineTotalPoisha,
    });
  }

  // Step 5: Cart discount evaluation
  // C1: Threshold flat
  const c1Promo = menu.promos.find(
    (p): p is ThresholdFlatPromo => p.type === 'threshold_flat'
  );
  let c1Discount = 0;
  if (c1Promo && cartSubtotalPoisha >= c1Promo.minSubtotalPoisha) {
    c1Discount = c1Promo.discountPoisha;
  }

  // C2: Coupon percent cap
  const enteredCouponClean = couponCode ? couponCode.trim() : null;
  let c2Discount = 0;
  let couponApplied: string | null = null;
  let couponRejectedReason: string | null = null;

  if (enteredCouponClean) {
    const matchingPromo = menu.promos.find(
      (p): p is CouponPercentCapPromo =>
        p.type === 'coupon_percent_cap' &&
        p.code.toUpperCase() === enteredCouponClean.toUpperCase()
    );

    if (!matchingPromo) {
      couponRejectedReason = `Invalid coupon code: ${enteredCouponClean}`;
    } else {
      const isValidTime = isBeforeHourDhaka(
        serverTimeIso,
        matchingPromo.validBeforeHourDhaka
      );

      if (!isValidTime) {
        couponRejectedReason = `Coupon ${matchingPromo.code} is only valid strictly before ${matchingPromo.validBeforeHourDhaka}:00 Asia/Dhaka`;
      } else {
        const rawPercentDiscount = roundHalfUp(
          cartSubtotalPoisha * matchingPromo.percent,
          100
        );
        c2Discount = Math.min(matchingPromo.maxDiscountPoisha, rawPercentDiscount);
      }
    }
  }

  // Promotion resolution: larger wins; tie -> C1
  let appliedPromoCode: string | null = null;
  let finalDiscountPoisha = 0;

  if (c2Discount > c1Discount) {
    appliedPromoCode = enteredCouponClean?.toUpperCase() ?? 'MORNING15';
    finalDiscountPoisha = c2Discount;
    couponApplied = appliedPromoCode;
  } else if (c1Discount >= c2Discount && c1Discount > 0) {
    appliedPromoCode = c1Promo?.id ?? 'C1';
    finalDiscountPoisha = c1Discount;
    couponApplied = null;
  }

  const discountedSubtotalPoisha = Math.max(
    0,
    cartSubtotalPoisha - finalDiscountPoisha
  );

  // Step 6: 5% VAT and payable calculation
  const vatPoisha = roundHalfUp(
    discountedSubtotalPoisha * menu.vatRatePercent,
    100
  );
  const payableBdt = roundHalfUp(discountedSubtotalPoisha + vatPoisha, 100);

  return {
    subtotalPoisha: cartSubtotalPoisha,
    appliedPromoCode,
    discountPoisha: finalDiscountPoisha,
    discountedSubtotalPoisha,
    vatPoisha,
    payableBdt,
    couponEntered: enteredCouponClean,
    couponApplied,
    couponRejectedReason,
    lines: pricedLines,
  };
}
