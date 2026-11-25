import appendixMenu from '../fixtures/appendixMenu.json';
import ordersSeed from '../fixtures/orders.seed.json';
import { getServerTimeIso, getServerTimeMs } from '../mocks/serverClock';
import { priceCart } from './pricingEngine';
import {
  cleanupExpiredReservations,
  consumeReservationsForCheckout,
  getCart,
} from './reservationEngine';
import type {
  CartLine,
  CheckoutResult,
  MenuFixture,
  StoredOrder,
} from '../types/order';

const menu = appendixMenu as MenuFixture;
export const ORDERS_STORAGE_KEY = 'smart_order_builder_orders';

// In-memory cache for stored orders and idempotency
let storedOrders: StoredOrder[] = [];
const checkoutIdempotencyMap = new Map<string, StoredOrder>();

/**
 * Parses and prices seed orders from orders.seed.json using each order's
 * createdAt timestamp and couponCode.
 */
function buildSeedOrders(): StoredOrder[] {
  const result: StoredOrder[] = [];

  for (const seed of ordersSeed.orders) {
    const cartLines: CartLine[] = seed.lines.map((l, idx) => ({
      id: `line_${idx + 1}`,
      config: {
        selections: l.options as Record<string, number>,
        quantity: l.qty,
      },
      quantity: l.qty,
    }));

    const pricing = priceCart(cartLines, menu, seed.couponCode, seed.createdAt);

    const stored: StoredOrder = {
      id: seed.id,
      createdAt: seed.createdAt,
      paymentMethod: seed.paymentMethod,
      coupon: {
        enteredCode: pricing.couponEntered,
        appliedCode: pricing.couponApplied,
        rejectedReason: pricing.couponRejectedReason,
      },
      items: (pricing.lines || []).map((line, idx) => ({
        lineId: line.lineId,
        quantity: seed.lines[idx]?.qty ?? 1,
        selections: seed.lines[idx]?.options ?? {},
        unitPricePoisha: line.unitPricePoisha,
        lineTotalPoisha: line.lineTotalPoisha,
      })),
      pricing: {
        subtotalPoisha: pricing.subtotalPoisha,
        appliedPromoCode: pricing.appliedPromoCode,
        discountPoisha: pricing.discountPoisha,
        discountedSubtotalPoisha: pricing.discountedSubtotalPoisha,
        vatPoisha: pricing.vatPoisha,
        payableBdt: pricing.payableBdt,
      },
    };

    result.push(stored);
  }

  return result;
}

/**
 * Initializes the orders store: if localStorage contains saved orders, loads them;
 * otherwise prices the seed orders, stores them in D6 format, and persists to localStorage.
 */
export function initOrders(): StoredOrder[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ORDERS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as StoredOrder[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        storedOrders = parsed;
        return storedOrders;
      }
    }
  } catch {
    // Fall back to seed orders if localStorage read/parse fails
  }

  storedOrders = buildSeedOrders();
  persistOrders();
  return storedOrders;
}

/**
 * Persists current stored orders into localStorage.
 */
function persistOrders(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(storedOrders));
    }
  } catch (err) {
    console.error('Failed to persist orders to localStorage:', err);
  }
}

/**
 * Returns all stored orders (seed + new).
 */
export function getStoredOrders(): StoredOrder[] {
  if (storedOrders.length === 0) {
    initOrders();
  }
  return [...storedOrders];
}

/**
 * Atomically checks out the active cart:
 * - Re-evaluates pricing dynamically at current server time (D2)
 * - Checks that cart is not empty and no items have expired
 * - Deduplicates double-clicks using checkoutIdempotencyKey (D4)
 * - Atomically converts reserved stock into sold stock
 * - Assigns server-generated ID and timestamp
 * - Persists order to localStorage
 */
export function checkout(
  paymentMethod: 'card' | 'bkash' | 'cash',
  couponCode: string | null,
  checkoutIdempotencyKey: string,
  serverTimeIso = getServerTimeIso()
): CheckoutResult {
  if (!checkoutIdempotencyKey) {
    throw new Error('checkoutIdempotencyKey is required for checkout');
  }

  // Deduplicate double-clicks
  const existingOrder = checkoutIdempotencyMap.get(checkoutIdempotencyKey);
  if (existingOrder) {
    return {
      ok: true,
      order: existingOrder,
      deduplicated: true,
    };
  }

  const cart = getCart();
  if (cart.length === 0) {
    return {
      ok: false,
      message: 'Cart is empty',
    };
  }

  // Check for expired reservations
  cleanupExpiredReservations(serverTimeIso);
  const hasExpired = cart.some((line) => line.expired);
  if (hasExpired) {
    return {
      ok: false,
      expired: true,
      message: 'One or more items in your cart have expired reservations',
    };
  }

  // Dynamically re-evaluate priceCart at serverTimeIso (D2)
  const pricing = priceCart(cart, menu, couponCode, serverTimeIso);

  // Atomically convert active reservations into sold stock and clear cart
  consumeReservationsForCheckout();

  // Create new StoredOrder in D6 format
  const orderId = `ord_${getServerTimeMs()}_${Math.random().toString(36).slice(2, 7)}`;
  const order: StoredOrder = {
    id: orderId,
    createdAt: serverTimeIso,
    paymentMethod,
    coupon: {
      enteredCode: pricing.couponEntered,
      appliedCode: pricing.couponApplied,
      rejectedReason: pricing.couponRejectedReason,
    },
    items: (pricing.lines || []).map((line, idx) => ({
      lineId: line.lineId,
      quantity: cart[idx]?.quantity ?? cart[idx]?.config.quantity ?? 1,
      selections: cart[idx]?.config.selections ?? {},
      unitPricePoisha: line.unitPricePoisha,
      lineTotalPoisha: line.lineTotalPoisha,
    })),
    pricing: {
      subtotalPoisha: pricing.subtotalPoisha,
      appliedPromoCode: pricing.appliedPromoCode,
      discountPoisha: pricing.discountPoisha,
      discountedSubtotalPoisha: pricing.discountedSubtotalPoisha,
      vatPoisha: pricing.vatPoisha,
      payableBdt: pricing.payableBdt,
    },
  };

  storedOrders.push(order);
  persistOrders();
  checkoutIdempotencyMap.set(checkoutIdempotencyKey, order);

  return {
    ok: true,
    order,
  };
}

/**
 * Serializes all stored orders (seed + new) as formatted JSON
 * for the "Download orders.json" button.
 */
export function exportOrdersJson(): string {
  const orders = getStoredOrders();
  return JSON.stringify(orders, null, 2);
}

/**
 * Resets stored orders in memory and in localStorage (used in test setups).
 */
export function resetOrderStore(): void {
  storedOrders = [];
  checkoutIdempotencyMap.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ORDERS_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}
