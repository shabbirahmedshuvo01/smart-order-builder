import { describe, expect, it } from 'vitest';
import appendixMenu from '../fixtures/appendixMenu.json';
import {
  priceCart,
  priceItem,
  roundHalfUp,
} from '../engine/pricingEngine';
import {
  calculateItemIngredients,
  calculateMaxAddableNow,
  checkStockShortages,
  computeRemainingStock,
  formatShortageMessage,
} from '../engine/stockEngine';
import { validate } from '../engine/validateRules';
import type { CartLine, ItemConfig, MenuFixture, Reservation } from '../types/order';

const menu = appendixMenu as MenuFixture;

describe('Smart Order Builder - Core Engine (TC-01 through TC-11)', () => {
  // Item definitions as specified
  const itemAConfig: ItemConfig = {
    selections: {
      toast: 1,
      scrambled: 2,
      sausage: 1,
      ketchup: 1,
    },
    quantity: 1,
  };

  const itemBConfig: ItemConfig = {
    selections: {
      croissant: 1,
      omelette: 2,
      fried: 2,
      sausage: 1,
      bacon: 1,
      hashbrown: 1,
      mushroom: 1,
      hollandaise: 1,
    },
    quantity: 1,
  };

  const itemCConfig: ItemConfig = {
    selections: {
      paratha: 1,
      fried: 2,
      tofu: 1,
      cheese: 2,
      beans: 1,
      mushroom: 1,
      chili: 1,
    },
    quantity: 1,
  };

  // -------------------------------------------------------------
  // TC-01: Valid Basic Item A
  // -------------------------------------------------------------
  it('TC-01: Item A passes validation and prices to exactly 380.00 BDT', () => {
    const violations = validate(itemAConfig, menu.groups, menu.rules);
    expect(violations).toHaveLength(0);

    const pricing = priceItem(itemAConfig, menu);
    expect(pricing.unitPricePoisha).toBe(38000);
    expect(pricing.unitPricePoisha / 100).toBe(380.0);
  });

  // -------------------------------------------------------------
  // TC-02: Min, Max, Step, and Distinct Violations
  // -------------------------------------------------------------
  it('TC-02: Detects min, max, step, and distinct group violations', () => {
    // Missing bread (min 1)
    const missingBread: ItemConfig = {
      selections: { scrambled: 2, sausage: 1 },
      quantity: 1,
    };
    const v1 = validate(missingBread, menu.groups, menu.rules);
    expect(v1.some((v) => v.groupId === 'bread' && v.id.includes('min'))).toBe(true);

    // Odd eggs count (step 2 from min 2: 3 eggs is invalid)
    const oddEggs: ItemConfig = {
      selections: { toast: 1, scrambled: 3, sausage: 1 },
      quantity: 1,
    };
    const v2 = validate(oddEggs, menu.groups, menu.rules);
    expect(v2.some((v) => v.groupId === 'eggs' && v.id.includes('step'))).toBe(true);

    // Exceeding sauce maxDistinct (maxDistinct: 2) and maxPerOption (1)
    const excessSauce: ItemConfig = {
      selections: {
        toast: 1,
        scrambled: 2,
        sausage: 1,
        ketchup: 2, // maxPerOption violation
        hollandaise: 1,
        chili: 1, // distinct count = 3 > 2
      },
      quantity: 1,
    };
    const v3 = validate(excessSauce, menu.groups, menu.rules);
    expect(v3.some((v) => v.groupId === 'sauce' && v.id.includes('maxDistinct'))).toBe(true);
    expect(v3.some((v) => v.groupId === 'sauce' && v.id.includes('maxPerOption'))).toBe(true);
  });

  // -------------------------------------------------------------
  // TC-03: Rule R1 (Hollandaise requires Scrambled or Omelette)
  // -------------------------------------------------------------
  it('TC-03: Enforces Rule R1 (Hollandaise requires Scrambled or Omelette)', () => {
    const invalidWithFriedOnly: ItemConfig = {
      selections: {
        toast: 1,
        fried: 2, // Fried only, no scrambled or omelette
        sausage: 1,
        hollandaise: 1,
      },
      quantity: 1,
    };
    const violations = validate(invalidWithFriedOnly, menu.groups, menu.rules);
    expect(violations.some((v) => v.id === 'R1')).toBe(true);

    // Adding scrambled satisfies R1
    const validWithScrambled: ItemConfig = {
      selections: {
        toast: 1,
        scrambled: 2,
        sausage: 1,
        hollandaise: 1,
      },
      quantity: 1,
    };
    const noR1 = validate(validWithScrambled, menu.groups, menu.rules);
    expect(noR1.some((v) => v.id === 'R1')).toBe(false);
  });

  // -------------------------------------------------------------
  // TC-04: Rules R2 & R4 (Excludes rules)
  // -------------------------------------------------------------
  it('TC-04: Enforces Rule R2 (Tofu excludes Sausage/Bacon) and R4 (Chili excludes Hollandaise)', () => {
    // Tofu + Sausage -> violates R2
    const tofuWithSausage: ItemConfig = {
      selections: {
        toast: 1,
        fried: 2,
        tofu: 1,
        sausage: 1,
      },
      quantity: 1,
    };
    const vR2 = validate(tofuWithSausage, menu.groups, menu.rules);
    expect(vR2.some((v) => v.id === 'R2')).toBe(true);

    // Chili + Hollandaise -> violates R4
    const chiliWithHollandaise: ItemConfig = {
      selections: {
        toast: 1,
        scrambled: 2,
        sausage: 1,
        hollandaise: 1,
        chili: 1,
      },
      quantity: 1,
    };
    const vR4 = validate(chiliWithHollandaise, menu.groups, menu.rules);
    expect(vR4.some((v) => v.id === 'R4')).toBe(true);
  });

  // -------------------------------------------------------------
  // TC-05: Rule R3 (OverrideLimit - Croissant limits Extras to 2)
  // -------------------------------------------------------------
  it('TC-05: Enforces Rule R3 (Croissant overrides Extras max from 4 to 2)', () => {
    // Croissant with 3 extras -> violates overridden max 2
    const croissantWith3Extras: ItemConfig = {
      selections: {
        croissant: 1,
        scrambled: 2,
        sausage: 1,
        hashbrown: 1,
        mushroom: 1,
        cheese: 1, // 3 extras
      },
      quantity: 1,
    };
    const violations = validate(croissantWith3Extras, menu.groups, menu.rules);
    expect(violations.some((v) => v.groupId === 'extras' && v.id.includes('max'))).toBe(true);

    // Croissant with 2 extras -> allowed
    const croissantWith2Extras: ItemConfig = {
      selections: {
        croissant: 1,
        scrambled: 2,
        sausage: 1,
        hashbrown: 1,
        mushroom: 1,
      },
      quantity: 1,
    };
    const validViolations = validate(croissantWith2Extras, menu.groups, menu.rules);
    expect(validViolations.some((v) => v.groupId === 'extras')).toBe(false);
  });

  // -------------------------------------------------------------
  // TC-06: Item B & C pricing, Cart Subtotal, MORNING15 Promo & VAT
  // -------------------------------------------------------------
  it('TC-06: Prices Item B (679.50 BDT), Item C (490.00 BDT), MORNING15 coupon at 10:59:59 yields 75.48 BDT VAT and 1585 BDT payable', () => {
    // Item B unit pricing
    const pricingB = priceItem(itemBConfig, menu);
    expect(pricingB.step1Poisha).toBe(75500);
    expect(pricingB.comboDiscountPoisha).toBe(7550);
    expect(pricingB.unitPricePoisha).toBe(67950);
    expect(pricingB.unitPricePoisha / 100).toBe(679.5);

    // Item C unit pricing
    const pricingC = priceItem(itemCConfig, menu);
    expect(pricingC.step1Poisha).toBe(51500);
    expect(pricingC.step2Poisha).toBe(49000); // 2500 beans free
    expect(pricingC.unitPricePoisha).toBe(49000);
    expect(pricingC.unitPricePoisha / 100).toBe(490.0);

    // Cart with B x 1 and C x 2
    const cart: CartLine[] = [
      { id: 'line_b', config: itemBConfig, quantity: 1 },
      { id: 'line_c', config: { ...itemCConfig, quantity: 2 }, quantity: 2 },
    ];

    // Server time 10:59:59 Asia/Dhaka
    const serverTime = '2026-11-25T10:59:59+06:00';
    const breakdown = priceCart(cart, menu, 'MORNING15', serverTime);

    // Cart subtotal: 67950 + 98000 = 165950 poisha (1,659.50 BDT)
    expect(breakdown.subtotalPoisha).toBe(165950);

    // MORNING15 capped at 15000 poisha (beats C1 10000 poisha)
    expect(breakdown.appliedPromoCode).toBe('MORNING15');
    expect(breakdown.discountPoisha).toBe(15000);
    expect(breakdown.discountedSubtotalPoisha).toBe(150950);

    // 5% VAT = roundHalfUp(150950 * 5, 100) = 7548 poisha = 75.48 BDT
    expect(breakdown.vatPoisha).toBe(7548);
    expect(breakdown.vatPoisha / 100).toBe(75.48);

    // Payable = roundHalfUp(150950 + 7548, 100) = 1585 BDT
    expect(breakdown.payableBdt).toBe(1585);
  });

  // -------------------------------------------------------------
  // TC-07: Promotion Expiration at 11:00:00 Asia/Dhaka
  // -------------------------------------------------------------
  it('TC-07: Rejects MORNING15 at 11:00:00 Asia/Dhaka, falls back to C1, yielding 77.98 BDT VAT and 1637 BDT payable', () => {
    const cart: CartLine[] = [
      { id: 'line_b', config: itemBConfig, quantity: 1 },
      { id: 'line_c', config: { ...itemCConfig, quantity: 2 }, quantity: 2 },
    ];

    // Server time exactly 11:00:00 Asia/Dhaka
    const serverTime = '2026-11-25T11:00:00+06:00';
    const breakdown = priceCart(cart, menu, 'MORNING15', serverTime);

    expect(breakdown.subtotalPoisha).toBe(165950);
    expect(breakdown.couponRejectedReason).toContain('strictly before 11:00 Asia/Dhaka');

    // C1 automatic promo applies (10000 poisha)
    expect(breakdown.appliedPromoCode).toBe('C1');
    expect(breakdown.discountPoisha).toBe(10000);
    expect(breakdown.discountedSubtotalPoisha).toBe(155950);

    // 5% VAT = roundHalfUp(155950 * 5, 100) = 7798 poisha = 77.98 BDT
    expect(breakdown.vatPoisha).toBe(7798);
    expect(breakdown.vatPoisha / 100).toBe(77.98);

    // Payable = roundHalfUp(155950 + 7798, 100) = 1637 BDT
    expect(breakdown.payableBdt).toBe(1637);
  });

  // -------------------------------------------------------------
  // TC-08: Remaining Stock Calculation
  // -------------------------------------------------------------
  it('TC-08: Cart with B x 1 and C x 2 consumes stock, leaving egg: 0, cheese: 0, croissant: 1', () => {
    const ingB = calculateItemIngredients(itemBConfig, menu.groups);
    const ingC2 = calculateItemIngredients(
      { ...itemCConfig, quantity: 2 },
      menu.groups
    );

    const reservations: Reservation[] = [
      {
        id: 'res_b',
        cartLineId: 'line_b',
        ingredients: ingB,
        createdAtIso: '2026-11-25T10:00:00.000Z',
        expiresAtIso: '2026-11-25T10:05:00.000Z',
      },
      {
        id: 'res_c',
        cartLineId: 'line_c',
        ingredients: ingC2,
        createdAtIso: '2026-11-25T10:00:00.000Z',
        expiresAtIso: '2026-11-25T10:05:00.000Z',
      },
    ];

    const remaining = computeRemainingStock(menu.initialStock, reservations);

    expect(remaining.egg).toBe(0);
    expect(remaining.cheese).toBe(0);
    expect(remaining.croissant).toBe(1);
    expect(remaining.sausage).toBe(3);
    expect(remaining.bacon).toBe(2);
  });

  // -------------------------------------------------------------
  // TC-09: Stock Shortage Detection ("Short: 1 egg")
  // -------------------------------------------------------------
  it('TC-09: Adding 1 egg when remaining stock has 0 eggs formats to "Short: 1 egg"', () => {
    const availableStock = { egg: 0, cheese: 0, croissant: 1 };
    const requested = { egg: 1 };

    const shortages = checkStockShortages(requested, availableStock);
    expect(shortages).toEqual([{ ingredient: 'egg', shortBy: 1 }]);

    const message = formatShortageMessage(shortages);
    expect(message).toBe('Short: 1 egg');
  });

  // -------------------------------------------------------------
  // TC-10: Editing Line B (Omelette 2 -> 1, Fried 2 -> 3)
  // -------------------------------------------------------------
  it('TC-10: Editing B to Omelette 1 and Fried 3 reprices B to 643.50 BDT and leaves 1 egg in stock', () => {
    // Edited B: 1 omelette (2 eggs) + 3 fried (3 eggs) = 5 eggs (down from 6 eggs)
    const editedBConfig: ItemConfig = {
      selections: {
        croissant: 1,
        omelette: 1,
        fried: 3,
        sausage: 1,
        bacon: 1,
        hashbrown: 1,
        mushroom: 1,
        hollandaise: 1,
      },
      quantity: 1,
    };

    const violations = validate(editedBConfig, menu.groups, menu.rules);
    expect(violations).toHaveLength(0);

    const pricing = priceItem(editedBConfig, menu);
    expect(pricing.step1Poisha).toBe(71500);
    expect(pricing.comboDiscountPoisha).toBe(7150);
    expect(pricing.unitPricePoisha).toBe(64350);
    expect(pricing.unitPricePoisha / 100).toBe(643.5);

    // Max addable check when editing B: 1 egg was released, so Fried (+1 egg) can be added
    const ingEditedB = calculateItemIngredients(editedBConfig, menu.groups);
    const ingC2 = calculateItemIngredients(
      { ...itemCConfig, quantity: 2 },
      menu.groups
    );

    const updatedReservations: Reservation[] = [
      {
        id: 'res_b_edited',
        cartLineId: 'line_b',
        ingredients: ingEditedB,
        createdAtIso: '2026-11-25T10:00:00.000Z',
        expiresAtIso: '2026-11-25T10:05:00.000Z',
      },
      {
        id: 'res_c',
        cartLineId: 'line_c',
        ingredients: ingC2,
        createdAtIso: '2026-11-25T10:00:00.000Z',
        expiresAtIso: '2026-11-25T10:05:00.000Z',
      },
    ];

    const remaining = computeRemainingStock(menu.initialStock, updatedReservations);
    expect(remaining.egg).toBe(1);

    // Verify calculateMaxAddableNow: with 1 egg left, fried (+1 egg) is 1, omelette (+2 eggs) is 0
    const emptyConfig: ItemConfig = { selections: {}, quantity: 1 };
    expect(calculateMaxAddableNow('fried', emptyConfig, menu.groups, remaining)).toBe(1);
    expect(calculateMaxAddableNow('omelette', emptyConfig, menu.groups, remaining)).toBe(0);
    expect(calculateMaxAddableNow('toast', emptyConfig, menu.groups, remaining)).toBe(20);
    expect(calculateMaxAddableNow('ketchup', emptyConfig, menu.groups, remaining)).toBe(Infinity);
  });

  // -------------------------------------------------------------
  // TC-11: Multi-Tab Stock Shortage ("Short: 2 egg, 2 cheese")
  // -------------------------------------------------------------
  it('TC-11: Multi-tab shortage when requesting 2 eggs and 2 cheese formats to "Short: 2 egg, 2 cheese"', () => {
    const availableStock = { egg: 0, cheese: 0, croissant: 1 };
    const requested = { egg: 2, cheese: 2 };

    const shortages = checkStockShortages(requested, availableStock);
    expect(shortages).toHaveLength(2);

    const message = formatShortageMessage(shortages);
    expect(message).toBe('Short: 2 egg, 2 cheese');
  });

  // -------------------------------------------------------------
  // Exact Integer Arithmetic RoundHalfUp Sanity
  // -------------------------------------------------------------
  it('Verifies roundHalfUp precision across boundary conditions', () => {
    expect(roundHalfUp(754750, 100)).toBe(7548);
    expect(roundHalfUp(248925, 10)).toBe(24893);
    expect(roundHalfUp(158498, 100)).toBe(1585);
    expect(roundHalfUp(779750, 100)).toBe(7798);
    expect(roundHalfUp(163748, 100)).toBe(1637);
  });
});
