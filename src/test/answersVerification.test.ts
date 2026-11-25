import { describe, expect, it } from 'vitest';
import appendixMenu from '../fixtures/appendixMenu.json';
import {
  priceCart,
  priceItem,
} from '../engine/pricingEngine';
import {
  getBestSellingOption,
  getCouponAppliedStats,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from '../engine/statsEngine';
import {
  calculateItemIngredients,
  checkStockShortages,
  formatShortageMessage,
} from '../engine/stockEngine';
import { validate } from '../engine/validateRules';
import { getStoredOrders, initOrders, resetOrderStore } from '../engine/orderEngine';
import type { CartLine, ItemConfig, MenuFixture } from '../types/order';

const menu = appendixMenu as MenuFixture;

describe('Section 10 Assessment Verification (Q1 through Q8)', () => {
  // -------------------------------------------------------------
  // Q1: Maximum Item C starting from empty cart
  // -------------------------------------------------------------
  it('Q1: Max Item C is 2 due to cheese constraint (4 in stock, 2 per Item C)', () => {
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

    const ingredientsPerUnit = calculateItemIngredients(itemCConfig, menu.groups);
    expect(ingredientsPerUnit.cheese).toBe(2);
    expect(ingredientsPerUnit.egg).toBe(2);
    expect(ingredientsPerUnit.paratha).toBe(1);
    expect(ingredientsPerUnit.tofu).toBe(1);
    expect(ingredientsPerUnit.beans).toBe(1);
    expect(ingredientsPerUnit.mushroom).toBe(1);

    // Initial stock limits
    const maxByCheese = Math.floor(menu.initialStock.cheese / ingredientsPerUnit.cheese); // 4 / 2 = 2
    const maxByEgg = Math.floor(menu.initialStock.egg / ingredientsPerUnit.egg); // 10 / 2 = 5
    const maxByParatha = Math.floor(menu.initialStock.paratha / ingredientsPerUnit.paratha); // 10 / 1 = 10
    const maxByTofu = Math.floor(menu.initialStock.tofu / ingredientsPerUnit.tofu); // 5 / 1 = 5
    const maxByBeans = Math.floor(menu.initialStock.beans / ingredientsPerUnit.beans); // 8 / 1 = 8
    const maxByMushroom = Math.floor(menu.initialStock.mushroom / ingredientsPerUnit.mushroom); // 6 / 1 = 6

    const maxCanAdd = Math.min(
      maxByCheese,
      maxByEgg,
      maxByParatha,
      maxByTofu,
      maxByBeans,
      maxByMushroom
    );

    expect(maxCanAdd).toBe(2);

    // Adding 3 Item C causes shortage on cheese
    const requested3 = calculateItemIngredients({ ...itemCConfig, quantity: 3 }, menu.groups);
    const shortages = checkStockShortages(requested3, menu.initialStock);
    expect(shortages).toContainEqual({ ingredient: 'cheese', shortBy: 2 });
    expect(formatShortageMessage(shortages)).toContain('Short: 2 cheese');

    console.log('[Q1] Max Item C starting from empty cart:', maxCanAdd, '(constrained by cheese: 4 in stock / 2 per unit)');
  });

  // -------------------------------------------------------------
  // Q2: Cheapest valid configuration
  // -------------------------------------------------------------
  it('Q2: Cheapest valid configuration is Toast (1), Fried (2), Tofu (1) = 360.00 BDT', () => {
    const cheapestConfig: ItemConfig = {
      selections: {
        toast: 1, // Bread min 1, max 1: toast is 0 BDT (cheapest)
        fried: 2, // Eggs min 2, max 6, step 2: fried is 3000 * 2 = 6000 poisha (cheapest)
        tofu: 1, // Protein min 1, max 3: tofu is 5000 poisha (cheaper than sausage 6000, bacon 9000)
      },
      quantity: 1,
    };

    // Verify it is completely valid
    const violations = validate(cheapestConfig, menu.groups, menu.rules);
    expect(violations).toHaveLength(0);

    // Verify unit price
    const pricing = priceItem(cheapestConfig, menu);
    expect(pricing.unitPricePoisha).toBe(36000);
    expect(pricing.unitPricePoisha / 100).toBe(360.0);

    console.log('[Q2] Cheapest valid configuration price:', pricing.unitPricePoisha / 100, 'BDT (36,000 poisha)');
  });

  // -------------------------------------------------------------
  // Q3: Cart = A x 3 at 10:30 vs 11:30 Asia/Dhaka
  // -------------------------------------------------------------
  it('Q3: Cart A x 3 yields 1,040 BDT at 10:30 and 1,197 BDT at 11:30', () => {
    const itemAConfig: ItemConfig = {
      selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
      quantity: 3,
    };

    const cartA3: CartLine[] = [
      { id: 'line_a3', config: itemAConfig, quantity: 3 },
    ];

    // At 10:30:00 Asia/Dhaka (before 11:00 cutoff)
    const at1030 = priceCart(cartA3, menu, 'MORNING15', '2026-11-25T10:30:00+06:00');
    expect(at1030.subtotalPoisha).toBe(114000); // 38,000 * 3
    expect(at1030.discountPoisha).toBe(15000); // 15% of 114,000 = 17,100 -> capped at 15,000 poisha
    expect(at1030.discountedSubtotalPoisha).toBe(99000);
    expect(at1030.vatPoisha).toBe(4950); // 5% of 99,000 = 4,950 poisha (49.50 BDT)
    expect(at1030.payableBdt).toBe(1040); // roundHalfUp(99,000 + 4,950 = 103,950) = 1,040 BDT

    // At 11:30:00 Asia/Dhaka (after 11:00 cutoff)
    const at1130 = priceCart(cartA3, menu, 'MORNING15', '2026-11-25T11:30:00+06:00');
    expect(at1130.subtotalPoisha).toBe(114000);
    expect(at1130.discountPoisha).toBe(0); // MORNING15 rejected, subtotal 114,000 < 120,000 so no C1
    expect(at1130.discountedSubtotalPoisha).toBe(114000);
    expect(at1130.vatPoisha).toBe(5700); // 5% of 114,000 = 5,700 poisha (57.00 BDT)
    expect(at1130.payableBdt).toBe(1197); // roundHalfUp(114,000 + 5,700 = 119,700) = 1,197 BDT

    console.log('[Q3 10:30] Subtotal:', at1030.subtotalPoisha / 100, 'Discount:', at1030.discountPoisha / 100, 'VAT:', at1030.vatPoisha / 100, 'Payable:', at1030.payableBdt);
    console.log('[Q3 11:30] Subtotal:', at1130.subtotalPoisha / 100, 'Discount:', at1130.discountPoisha / 100, 'VAT:', at1130.vatPoisha / 100, 'Payable:', at1130.payableBdt);
  });

  // -------------------------------------------------------------
  // Q4: Cart after TC-10 (B edited + C x 2) at 11:30 Asia/Dhaka
  // -------------------------------------------------------------
  it('Q4: Post TC-10 cart at 11:30 Dhaka yields subtotal 162,350 poisha and payable 1,600 BDT', () => {
    // B edited: croissant 1, omelette 1, fried 3, sausage 1, bacon 1, hashbrown 1, mushroom 1, hollandaise 1
    const editedB: ItemConfig = {
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

    const itemC: ItemConfig = {
      selections: {
        paratha: 1,
        fried: 2,
        tofu: 1,
        cheese: 2,
        beans: 1,
        mushroom: 1,
        chili: 1,
      },
      quantity: 2,
    };

    const cart: CartLine[] = [
      { id: 'b_edited', config: editedB, quantity: 1 },
      { id: 'c_x2', config: itemC, quantity: 2 },
    ];

    // At 11:30 Asia/Dhaka (MORNING15 rejected; C1 threshold 120,000 applies with 10,000 poisha discount)
    const breakdown = priceCart(cart, menu, 'MORNING15', '2026-11-25T11:30:00+06:00');

    expect(breakdown.subtotalPoisha).toBe(162350); // 64,350 + 98,000 = 162,350 poisha (1,623.50 BDT)
    expect(breakdown.appliedPromoCode).toBe('C1');
    expect(breakdown.discountPoisha).toBe(10000); // C1: 10,000 poisha (100.00 BDT)
    expect(breakdown.discountedSubtotalPoisha).toBe(152350); // 1,523.50 BDT
    expect(breakdown.vatPoisha).toBe(7618); // roundHalfUp(152,350 * 5, 100) = 7,618 poisha (76.18 BDT)
    expect(breakdown.payableBdt).toBe(1600); // roundHalfUp(152,350 + 7,618 = 159,968) = 1,600 BDT

    console.log('[Q4 Post TC-10 at 11:30] Subtotal:', breakdown.subtotalPoisha, 'Discount:', breakdown.discountPoisha, 'VAT:', breakdown.vatPoisha, 'Payable BDT:', breakdown.payableBdt);
  });

  // -------------------------------------------------------------
  // Q5: Payable of each seed order and total revenue
  // -------------------------------------------------------------
  it('Q5: Seed orders payable breakdown and total revenue = 4,995 BDT', () => {
    resetOrderStore();
    const seedOrders = initOrders();

    const expectedPayables: Record<string, number> = {
      'ORD-1001': 339,
      'ORD-1002': 713,
      'ORD-1003': 1271,
      'ORD-1004': 578,
      'ORD-1005': 866,
      'ORD-1006': 1228,
    };

    for (const order of seedOrders) {
      expect(order.pricing.payableBdt).toBe(expectedPayables[order.id]);
    }

    const { totalRevenueBdt } = getTotalRevenue(seedOrders);
    expect(totalRevenueBdt).toBe(4995);

    console.log('[Q5] Seed orders payables:', expectedPayables, 'Total Revenue:', totalRevenueBdt, 'BDT');
  });

  // -------------------------------------------------------------
  // Q6: Best-selling option by units
  // -------------------------------------------------------------
  it('Q6: Best-selling option across seed orders is Fried with 10 units', () => {
    const seedOrders = getStoredOrders();
    const bestSelling = getBestSellingOption(seedOrders, menu);

    expect(bestSelling.optionId).toBe('fried');
    expect(bestSelling.optionName).toBe('Fried');
    expect(bestSelling.totalUnits).toBe(10);

    console.log('[Q6] Best-selling option:', bestSelling.optionName, bestSelling.totalUnits, 'units');
  });

  // -------------------------------------------------------------
  // Q7: Payment method with most revenue in seed orders
  // -------------------------------------------------------------
  it('Q7: Payment method with most revenue is card with 2,145 BDT', () => {
    const seedOrders = getStoredOrders();
    const revByMethod = getRevenueByPaymentMethod(seedOrders);

    expect(revByMethod.topMethod).toBe('card');
    expect(revByMethod.topRevenueBdt).toBe(2145);
    expect(revByMethod.breakdown.card).toBe(2145);
    expect(revByMethod.breakdown.bkash).toBe(1579);
    expect(revByMethod.breakdown.cash).toBe(1271);

    console.log('[Q7] Top payment method:', revByMethod.topMethod, revByMethod.topRevenueBdt, 'BDT');
  });

  // -------------------------------------------------------------
  // Q8: Coupon MORNING15 evaluation across seed orders
  // -------------------------------------------------------------
  it('Q8: Exactly 3 seed orders received MORNING15, while ORD-1006 was rejected due to 11:00 cutoff', () => {
    const seedOrders = getStoredOrders();
    const couponStats = getCouponAppliedStats(seedOrders);

    expect(couponStats.appliedCount).toBe(3); // ORD-1001, ORD-1003, ORD-1005

    const ord1006 = seedOrders.find((o) => o.id === 'ORD-1006');
    expect(ord1006?.coupon.enteredCode).toBe('MORNING15');
    expect(ord1006?.coupon.appliedCode).toBeNull();
    expect(ord1006?.coupon.rejectedReason).toContain('strictly before 11:00 Asia/Dhaka');

    console.log('[Q8] MORNING15 applied count:', couponStats.appliedCount, 'ORD-1006 rejected reason:', ord1006?.coupon.rejectedReason);
  });
});
