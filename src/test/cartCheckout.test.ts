import { beforeEach, describe, expect, it } from 'vitest';
import { GuardedPricingClient } from '../engine/clientPricing';
import { exportOrdersJson, getStoredOrders, initOrders } from '../engine/orderEngine';
import {
  getCart,
  getRemainingStock,
  getReservations,
  resetReservationStore,
} from '../engine/reservationEngine';
import {
  handleAddToCart,
  handleCheckout,
  handleEditCartItem,
  resetMockStore,
} from '../mocks/mockStore';
import {
  advanceServerTimeMs,
  computeServerClockOffset,
  getServerTimeIso,
  resetServerClock,
} from '../mocks/serverClock';
import type { ItemConfig, StoredOrder } from '../types/order';

describe('Smart Order Builder - Phase 2 (TC-12 through TC-17)', () => {
  const itemAConfig: ItemConfig = {
    selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 },
    quantity: 1,
  };

  const itemBConfig: ItemConfig = {
    selections: {
      croissant: 1,
      omelette: 2,
      fried: 2,
      sausage: 1,
      bacon: 1,
      hashbrown: 2,
      hollandaise: 1,
    },
    quantity: 1,
  };

  beforeEach(() => {
    resetMockStore();
  });

  // -------------------------------------------------------------
  // TC-12: Out-of-Order /api/price Responses Never Overwrite Newer Price
  // -------------------------------------------------------------
  it('TC-12: Out-of-order /api/price responses never overwrite a newer configuration displayed price', async () => {
    const client = new GuardedPricingClient();

    // Simulation:
    // Request 1 is dispatched first for Config 1 (delayed 60ms, returns 250.00 BDT / 25000 poisha)
    // Request 2 is dispatched second for Config 2 (faster 10ms, returns 380.00 BDT / 38000 poisha)
    const req1Promise = client.requestPrice(
      () =>
        new Promise<{ subtotalPoisha: number }>((resolve) => {
          setTimeout(() => resolve({ subtotalPoisha: 25000 }), 60);
        })
    );

    const req2Promise = client.requestPrice(
      () =>
        new Promise<{ subtotalPoisha: number }>((resolve) => {
          setTimeout(() => resolve({ subtotalPoisha: 38000 }), 10);
        })
    );

    const [res1, res2] = await Promise.all([req1Promise, req2Promise]);

    // Request 2 arrived first and became the displayed pricing
    expect(res2.isStale).toBe(false);
    expect(res2.pricing?.subtotalPoisha).toBe(38000);

    // Request 1 finished later and was discarded as stale
    expect(res1.isStale).toBe(true);

    // Final displayed pricing remains Request 2's price (38000 poisha)
    expect(client.getDisplayedPricing()?.subtotalPoisha).toBe(38000);
  });

  // -------------------------------------------------------------
  // TC-13: Deduplicating Concurrent Add to Cart Clicks
  // -------------------------------------------------------------
  it('TC-13: Clicking Add to Cart 3 times quickly with the same idempotency key creates exactly 1 cart item and 1 reservation', () => {
    const idempotencyKey = 'cart_add_tc13_test';

    const res1 = handleAddToCart(itemAConfig, idempotencyKey);
    const res2 = handleAddToCart(itemAConfig, idempotencyKey);
    const res3 = handleAddToCart(itemAConfig, idempotencyKey);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res3.ok).toBe(true);

    // Call 2 and Call 3 are deduplicated
    expect(res2.deduplicated).toBe(true);
    expect(res3.deduplicated).toBe(true);
    expect(res2.line?.id).toBe(res1.line?.id);
    expect(res3.line?.id).toBe(res1.line?.id);

    // Only 1 cart item and 1 reservation exist in the store
    expect(getCart()).toHaveLength(1);
    expect(getReservations()).toHaveLength(1);

    // Ingredients reserved only once (itemA uses 2 scrambled eggs, so 10 - 2 = 8 remaining)
    const stock = getRemainingStock();
    expect(stock.egg).toBe(8);
    expect(stock.sausage).toBe(3);
  });

  // -------------------------------------------------------------
  // TC-14: Failed Reservation Leaves Zero Stock Held & Succeeds on Retry
  // -------------------------------------------------------------
  it('TC-14: Simulated failure on reserve call leaves zero stock held, keeps configuration intact, and succeeds on Retry', () => {
    // Attempting to reserve an item exceeding available stock (15 eggs when only 10 exist)
    const excessiveConfig: ItemConfig = {
      selections: { scrambled: 15, toast: 1 },
      quantity: 1,
    };

    const failedResult = handleAddToCart(excessiveConfig, 'idem_failed_tc14');
    expect(failedResult.ok).toBe(false);
    expect(failedResult.message).toContain('Short: 5 egg');

    // Zero stock held and no phantom reservations created
    expect(getCart()).toHaveLength(0);
    expect(getReservations()).toHaveLength(0);
    expect(getRemainingStock().egg).toBe(10);

    // User's form config remains intact and user can retry with valid config
    const retryConfig: ItemConfig = {
      selections: { scrambled: 2, toast: 1 },
      quantity: 1,
    };
    const retryResult = handleAddToCart(retryConfig, 'idem_retry_tc14');
    expect(retryResult.ok).toBe(true);
    expect(getCart()).toHaveLength(1);
    expect(getReservations()).toHaveLength(1);
    expect(getRemainingStock().egg).toBe(8);
  });

  // -------------------------------------------------------------
  // TC-15: Server Clock Advance Past 5:00 TTL Releases Held Stock & Marks Item Read-Only
  // -------------------------------------------------------------
  it('TC-15: Advancing server clock past 5:00 releases held stock, marks item read-only, and verifies countdown offset matches the +90s server clock', () => {
    // Verify client-side helper computes approximately +90s server clock offset
    const serverTime = getServerTimeIso();
    const offset = computeServerClockOffset(serverTime);
    // Offset should be within 100ms of +90_000ms
    expect(offset).toBeGreaterThanOrEqual(89_900);
    expect(offset).toBeLessThanOrEqual(90_100);

    // Add Item B to cart (holds 6 eggs, 1 croissant)
    const addResult = handleAddToCart(itemBConfig, 'idem_tc15');
    expect(addResult.ok).toBe(true);

    const stockBeforeExpiry = getRemainingStock();
    expect(stockBeforeExpiry.egg).toBe(4); // 10 - 6 = 4
    expect(stockBeforeExpiry.croissant).toBe(1); // 2 - 1 = 1

    // Advance mock server clock past the 300s TTL (305 seconds)
    advanceServerTimeMs(305_000);

    // Stock must be automatically released back
    const stockAfterExpiry = getRemainingStock();
    expect(stockAfterExpiry.egg).toBe(10);
    expect(stockAfterExpiry.croissant).toBe(2);

    // Cart line marked expired (read-only)
    const cart = getCart();
    expect(cart).toHaveLength(1);
    expect(cart[0].expired).toBe(true);

    // Editing an expired line returns conflict per D3 while preserving client inputs
    const editResult = handleEditCartItem(cart[0].id, itemAConfig);
    expect(editResult.ok).toBe(false);
    expect(editResult.expired).toBe(true);
    expect(editResult.message).toContain('Reservation expired and stock was released');
  });

  // -------------------------------------------------------------
  // TC-16: Deduplicating Double-Click Pay
  // -------------------------------------------------------------
  it('TC-16: Clicking Pay twice quickly with the same checkoutIdempotencyKey creates exactly 1 order, empties cart, and keeps sold stock deducted once', () => {
    // Add Item A to cart
    handleAddToCart(itemAConfig, 'idem_tc16_cart');
    expect(getCart()).toHaveLength(1);

    const checkoutKey = 'pay_tc16_idempotency_key';

    // First pay click
    const pay1 = handleCheckout('card', null, checkoutKey);
    expect(pay1.ok).toBe(true);
    expect(pay1.order).toBeDefined();

    // Second pay click with same key
    const pay2 = handleCheckout('card', null, checkoutKey);
    expect(pay2.ok).toBe(true);
    expect(pay2.deduplicated).toBe(true);
    expect(pay2.order?.id).toBe(pay1.order?.id);

    // Cart is now empty
    expect(getCart()).toHaveLength(0);
    expect(getReservations()).toHaveLength(0);

    // Stock deducted only once: Item A used 2 eggs (10 - 2 = 8) and 1 sausage (4 - 1 = 3)
    const remaining = getRemainingStock();
    expect(remaining.egg).toBe(8);
    expect(remaining.sausage).toBe(3);
  });

  // -------------------------------------------------------------
  // TC-17: Seed Order Pricing, localStorage Persistence & JSON Export Matching D6
  // -------------------------------------------------------------
  it('TC-17: Re-initializing store/app after checkout preserves all seed + new orders in localStorage, and exportOrdersJson produces valid JSON matching D6 schema', () => {
    // Seed orders on initial load: 6 orders from orders.seed.json
    const initialOrders = getStoredOrders();
    expect(initialOrders).toHaveLength(6);

    // Verify seed order ORD-1001 was priced at its createdAt and MORNING15 coupon
    const ord1001 = initialOrders.find((o) => o.id === 'ORD-1001');
    expect(ord1001).toBeDefined();
    expect(ord1001?.pricing.subtotalPoisha).toBe(38000);
    expect(ord1001?.pricing.discountPoisha).toBe(5700); // 15% of 38000 = 5700
    expect(ord1001?.pricing.appliedPromoCode).toBe('MORNING15');

    // Add Item A and checkout to create a 7th order
    handleAddToCart(itemAConfig, 'idem_tc17_cart');
    const checkoutResult = handleCheckout('bkash', 'MORNING15', 'pay_tc17_key');
    expect(checkoutResult.ok).toBe(true);

    const ordersAfterPay = getStoredOrders();
    expect(ordersAfterPay).toHaveLength(7);

    // Simulate page refresh: reset in-memory array and reload from localStorage
    resetReservationStore();
    resetServerClock();
    // In-memory array emptied, but localStorage remains populated
    const reloadedOrders = initOrders();
    expect(reloadedOrders).toHaveLength(7);

    // Export orders JSON for Download button
    const exportedJson = exportOrdersJson();
    expect(typeof exportedJson).toBe('string');

    // Verify JSON is valid and strictly adheres to D6 schema
    const parsed: StoredOrder[] = JSON.parse(exportedJson);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(7);

    for (const order of parsed) {
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('createdAt');
      expect(order).toHaveProperty('paymentMethod');
      expect(order).toHaveProperty('coupon');
      expect(order.coupon).toHaveProperty('enteredCode');
      expect(order.coupon).toHaveProperty('appliedCode');
      expect(order.coupon).toHaveProperty('rejectedReason');

      expect(order).toHaveProperty('items');
      expect(Array.isArray(order.items)).toBe(true);
      for (const item of order.items) {
        expect(item).toHaveProperty('lineId');
        expect(typeof item.quantity).toBe('number');
        expect(typeof item.unitPricePoisha).toBe('number');
        expect(typeof item.lineTotalPoisha).toBe('number');
        expect(Number.isInteger(item.unitPricePoisha)).toBe(true);
        expect(Number.isInteger(item.lineTotalPoisha)).toBe(true);
      }

      expect(order).toHaveProperty('pricing');
      expect(Number.isInteger(order.pricing.subtotalPoisha)).toBe(true);
      expect(Number.isInteger(order.pricing.discountPoisha)).toBe(true);
      expect(Number.isInteger(order.pricing.discountedSubtotalPoisha)).toBe(true);
      expect(Number.isInteger(order.pricing.vatPoisha)).toBe(true);
      expect(Number.isInteger(order.pricing.payableBdt)).toBe(true);
    }
  });
});
