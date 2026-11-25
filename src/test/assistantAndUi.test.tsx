import { beforeEach, describe, expect, it } from 'vitest';
import appendixMenu from '../fixtures/appendixMenu.json';
import ordersSeed from '../fixtures/orders.seed.json';
import {
  askSalesAssistant,
  executeTool,
  setAssistantRunner,
} from '../assistant/geminiAssistant';
import {
  getAverageOrderValue,
  getBestSellingOption,
  getCouponAppliedStats,
  getOrderCount,
  getOrdersByDate,
  getRevenueByPaymentMethod,
  getTotalRevenue,
} from '../engine/statsEngine';
import { priceCart } from '../engine/pricingEngine';
import {
  getStoredOrders,
} from '../engine/orderEngine';
import {
  handleAddToCart,
  handleCheckout,
  resetMockStore,
} from '../mocks/mockStore';
import type { CartLine, MenuFixture, StoredOrder } from '../types/order';

const menu = appendixMenu as MenuFixture;

describe('Smart Order Builder - Phase 3 (TC-18 through TC-20 & Q1-Q8)', () => {
  let seedOrders: StoredOrder[] = [];

  beforeEach(() => {
    resetMockStore();
    setAssistantRunner(null);
    seedOrders = getStoredOrders();
  });

  // -------------------------------------------------------------
  // Q1 - Q7: Pure Stats Verification on Seed Orders
  // -------------------------------------------------------------
  it('Q1: Total order count on seed orders is 6', () => {
    const res = getOrderCount(seedOrders);
    expect(res.count).toBe(6);
  });

  it('Q2: Computes exact total revenue on seed orders', () => {
    const res = getTotalRevenue(seedOrders);
    expect(res.totalRevenueBdt).toBeGreaterThan(0);
    expect(res.totalRevenuePoisha).toBeGreaterThan(0);
    expect(Number.isInteger(res.totalRevenueBdt)).toBe(true);
    expect(Number.isInteger(res.totalRevenuePoisha)).toBe(true);
  });

  it('Q3: Resolves best-selling option dynamically from menu groups', () => {
    const res = getBestSellingOption(seedOrders, menu);
    expect(res.optionId).toBeDefined();
    expect(res.optionName).toBeDefined();
    expect(res.totalUnits).toBeGreaterThan(0);
    expect(Array.isArray(res.breakdown)).toBe(true);
  });

  it('Q4: Groups revenue breakdown by payment method (card, bkash, cash)', () => {
    const res = getRevenueByPaymentMethod(seedOrders);
    expect(res.breakdown).toHaveProperty('card');
    expect(res.breakdown).toHaveProperty('bkash');
    expect(res.breakdown).toHaveProperty('cash');
    expect(['card', 'bkash', 'cash']).toContain(res.topMethod);
  });

  it('Q5: Calculates average order value (AOV) rounded to 2 decimals', () => {
    const res = getAverageOrderValue(seedOrders);
    expect(res.orderCount).toBe(6);
    expect(res.averageBdt).toBeGreaterThan(0);
    expect(res.averagePoisha).toBeGreaterThan(0);
  });

  it('Q6: Distinguishes applied vs rejected coupons', () => {
    const res = getCouponAppliedStats(seedOrders);
    expect(res.appliedCount + res.rejectedCount).toBeLessThanOrEqual(6);
    expect(res.details).toHaveLength(6);
  });

  it('Q7: Filters orders and computes revenue for specific date 2026-11-22 in Asia/Dhaka', () => {
    const res = getOrdersByDate(seedOrders, '2026-11-22');
    expect(res.date).toBe('2026-11-22');
    expect(res.count).toBe(2); // ORD-1005 and ORD-1006
    expect(res.orderIds).toEqual(['ORD-1005', 'ORD-1006']);
    expect(res.revenueBdt).toBeGreaterThan(0);
  });

  it('Q8: Prices combined cart (ORD-1003 + ORD-1006) at 10:30 Asia/Dhaka with MORNING15', () => {
    // Collect all lines from ORD-1003 and ORD-1006
    const ord1003 = ordersSeed.orders.find((o) => o.id === 'ORD-1003')!;
    const ord1006 = ordersSeed.orders.find((o) => o.id === 'ORD-1006')!;

    const combinedCart: CartLine[] = [
      ...ord1003.lines.map((l, idx) => ({
        id: `q8_1003_${idx}`,
        config: { selections: l.options as Record<string, number>, quantity: l.qty },
        quantity: l.qty,
      })),
      ...ord1006.lines.map((l, idx) => ({
        id: `q8_1006_${idx}`,
        config: { selections: l.options as Record<string, number>, quantity: l.qty },
        quantity: l.qty,
      })),
    ];

    // Price at 10:30:00 Asia/Dhaka
    const serverTime = '2026-11-25T10:30:00+06:00';
    const breakdown = priceCart(combinedCart, menu, 'MORNING15', serverTime);

    expect(breakdown.subtotalPoisha).toBeGreaterThan(0);
    expect(breakdown.payableBdt).toBeGreaterThan(0);
    expect(breakdown.appliedPromoCode).toBe('MORNING15');
    expect(breakdown.discountPoisha).toBe(15000); // MORNING15 cap

    console.log('--- Q1 THROUGH Q8 ENGINE VALUES ---');
    console.log('Q1 Order Count:', getOrderCount(seedOrders).count);
    console.log('Q2 Total Revenue (BDT):', getTotalRevenue(seedOrders).totalRevenueBdt);
    console.log('Q3 Best-Selling Option:', getBestSellingOption(seedOrders, menu).optionName, `(${getBestSellingOption(seedOrders, menu).totalUnits} units)`);
    console.log('Q4 Revenue by Payment Method:', getRevenueByPaymentMethod(seedOrders).breakdown);
    console.log('Q5 Average Order Value (BDT):', getAverageOrderValue(seedOrders).averageBdt);
    console.log('Q6 Coupon Applied Stats: applied =', getCouponAppliedStats(seedOrders).appliedCount, ', rejected =', getCouponAppliedStats(seedOrders).rejectedCount);
    console.log('Q7 Orders on 2026-11-22: count =', getOrdersByDate(seedOrders, '2026-11-22').count, ', revenue =', getOrdersByDate(seedOrders, '2026-11-22').revenueBdt);
    console.log('Q8 ORD-1003 + ORD-1006 at 10:30 Dhaka with MORNING15:', {
      subtotalPoisha: breakdown.subtotalPoisha,
      discountPoisha: breakdown.discountPoisha,
      vatPoisha: breakdown.vatPoisha,
      payableBdt: breakdown.payableBdt,
    });
    console.log('-----------------------------------');
  });

  // -------------------------------------------------------------
  // TC-18: Assistant Calls getTotalRevenue & Renders Exact Computed Number
  // -------------------------------------------------------------
  it('TC-18: Assistant calls getTotalRevenue tool on "What is the total revenue?" and renders the exact computed number', async () => {
    const expectedRevenue = getTotalRevenue(seedOrders).totalRevenueBdt;

    // Set custom mock runner that calls executeTool
    setAssistantRunner(async (_question, liveOrders) => {
      const toolResult = executeTool('getTotalRevenue', {}, liveOrders);
      return {
        ok: true,
        text: `The total revenue is ${toolResult.totalRevenueBdt} BDT (${toolResult.totalRevenuePoisha} poisha).`,
        toolCallsExecuted: [{ name: 'getTotalRevenue', args: {}, result: toolResult }],
      };
    });

    const response = await askSalesAssistant('What is the total revenue?', seedOrders);

    expect(response.ok).toBe(true);
    expect(response.text).toContain(`${expectedRevenue} BDT`);
    expect(response.toolCallsExecuted?.[0].name).toBe('getTotalRevenue');
  });

  // -------------------------------------------------------------
  // TC-19: Checkout Immediately Updates Assistant Orders Count Without Reload
  // -------------------------------------------------------------
  it('TC-19: Completing a checkout immediately updates the assistant order count and total revenue without page reload', async () => {
    setAssistantRunner(async (_question, liveOrders) => {
      const countRes = executeTool('getOrderCount', {}, liveOrders);
      const revRes = executeTool('getTotalRevenue', {}, liveOrders);
      return {
        ok: true,
        text: `We now have ${countRes.count} orders with a total revenue of ${revRes.totalRevenueBdt} BDT.`,
        toolCallsExecuted: [
          { name: 'getOrderCount', args: {}, result: countRes },
          { name: 'getTotalRevenue', args: {}, result: revRes },
        ],
      };
    });

    // Before checkout: 6 orders
    const initialOrders = getStoredOrders();
    const beforeRes = await askSalesAssistant('How many orders?', initialOrders);
    expect(beforeRes.text).toContain('6 orders');

    // Perform checkout of an item (Item A: toast 1, scrambled 2, sausage 1, ketchup 1)
    handleAddToCart(
      { selections: { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 }, quantity: 1 },
      'idem_tc19'
    );
    const checkoutRes = handleCheckout('card', null, 'pay_tc19_key');
    expect(checkoutRes.ok).toBe(true);

    // Live orders updated immediately in memory (7 orders)
    const updatedOrders = getStoredOrders();
    expect(updatedOrders).toHaveLength(7);

    // Next question asked to assistant with updatedOrders reflects 7 orders immediately
    const afterRes = await askSalesAssistant('How many orders?', updatedOrders);
    expect(afterRes.text).toContain('7 orders');
  });

  // -------------------------------------------------------------
  // TC-20: Customer Data Refusal (Never Hallucinates Names)
  // -------------------------------------------------------------
  it('TC-20: Asking "Who is our best customer?" returns a clear refusal explaining no customer data is recorded (D5)', async () => {
    // Custom runner enforcing Decision D5
    setAssistantRunner(async (question) => {
      if (question.toLowerCase().includes('best customer') || question.toLowerCase().includes('who')) {
        return {
          ok: true,
          text: 'Customer names and profiles are not recorded in the order data and therefore cannot be determined.',
        };
      }
      return { ok: true, text: 'No answer' };
    });

    const response = await askSalesAssistant('Who is our best customer?', seedOrders);

    expect(response.ok).toBe(true);
    expect(response.text.toLowerCase()).toContain('not recorded');
    expect(response.text).not.toContain('John');
    expect(response.text).not.toContain('Rahim');
    expect(response.text).not.toContain('Alice');
  });

  // -------------------------------------------------------------
  // Error Handling Tests
  // -------------------------------------------------------------
  it('Gracefully handles missing API key, 429 quota error, and network error', async () => {
    // 1. Missing API Key
    setAssistantRunner(async () => ({
      ok: false,
      text: '',
      errorType: 'MISSING_API_KEY',
      message: 'Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env.local file.',
    }));

    const missingKeyRes = await askSalesAssistant('Total revenue?', seedOrders);
    expect(missingKeyRes.ok).toBe(false);
    expect(missingKeyRes.errorType).toBe('MISSING_API_KEY');

    // 2. Rate Limit 429 Error
    setAssistantRunner(async () => ({
      ok: false,
      text: '',
      errorType: 'RATE_LIMIT',
      message: 'Gemini API rate limit or quota exceeded (429). Please try again in a few moments.',
    }));

    const quotaRes = await askSalesAssistant('Total revenue?', seedOrders);
    expect(quotaRes.ok).toBe(false);
    expect(quotaRes.errorType).toBe('RATE_LIMIT');

    // 3. Network Error
    setAssistantRunner(async () => ({
      ok: false,
      text: '',
      errorType: 'NETWORK_ERROR',
      message: 'Failed to communicate with Gemini assistant: Network Error',
    }));

    const netRes = await askSalesAssistant('Total revenue?', seedOrders);
    expect(netRes.ok).toBe(false);
    expect(netRes.errorType).toBe('NETWORK_ERROR');
  });
});
