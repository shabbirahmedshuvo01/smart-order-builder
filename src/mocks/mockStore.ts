import appendixMenu from '../fixtures/appendixMenu.json';
import {
  checkout,
  exportOrdersJson,
  getStoredOrders,
  initOrders,
  resetOrderStore,
} from '../engine/orderEngine';
import { priceCart, priceItem } from '../engine/pricingEngine';
import {
  addToCart,
  editCartItem,
  getCart,
  getRemainingStock,
  getReservations,
  removeCartItem,
  resetReservationStore,
} from '../engine/reservationEngine';
import {
  getServerTimeIso,
  resetServerClock,
} from './serverClock';
import type {
  CartLine,
  CheckoutResult,
  ItemConfig,
  MenuFixture,
  ReservationResult,
  StoreState,
} from '../types/order';

const menu = appendixMenu as MenuFixture;

export interface SimulationConfig {
  latencyMinMs: number;
  latencyMaxMs: number;
  failureRate: number; // 0.0 to 1.0 (e.g. 0.15 for 15%)
  enabled: boolean;
}

// Runtime simulation options (200-1500ms latency, 15% random failure rate for /api/price)
let simulationConfig: SimulationConfig = {
  latencyMinMs: 200,
  latencyMaxMs: 1500,
  failureRate: 0.15,
  enabled: false, // Default off in unit test runs; enabled in runtime
};

export function setSimulationConfig(config: Partial<SimulationConfig>): void {
  simulationConfig = { ...simulationConfig, ...config };
}

export function getSimulationConfig(): SimulationConfig {
  return simulationConfig;
}

export function getMenu(): { menu: MenuFixture; serverTime: string } {
  return {
    menu,
    serverTime: getServerTimeIso(),
  };
}

export function getStoreState(): StoreState {
  const serverTime = getServerTimeIso();
  return {
    cart: getCart(),
    reservations: getReservations(),
    remainingStock: getRemainingStock(serverTime),
    serverTime,
  };
}

export function price(
  cart?: CartLine[],
  config?: ItemConfig,
  couponCode?: string | null
): Record<string, any> {
  const serverTime = getServerTimeIso();
  if (cart && cart.length > 0) {
    const breakdown = priceCart(cart, menu, couponCode || null, serverTime);
    return { ...breakdown, serverTime };
  }
  if (config) {
    const single = priceItem(config, menu);
    return { ...single, serverTime };
  }
  return {
    subtotalPoisha: 0,
    payableBdt: 0,
    serverTime,
  };
}

export function handleAddToCart(
  config: ItemConfig,
  idempotencyKey: string
): ReservationResult {
  return addToCart(config, idempotencyKey, getServerTimeIso());
}

export function handleEditCartItem(
  lineId: string,
  newConfig: ItemConfig
): ReservationResult {
  return editCartItem(lineId, newConfig, getServerTimeIso());
}

export function handleRemoveCartItem(lineId: string): { ok: boolean } {
  return removeCartItem(lineId);
}

export function handleCheckout(
  paymentMethod: 'card' | 'bkash' | 'cash',
  couponCode: string | null,
  checkoutIdempotencyKey: string
): CheckoutResult {
  return checkout(paymentMethod, couponCode, checkoutIdempotencyKey, getServerTimeIso());
}

export function handleGetOrders(): Record<string, any> {
  return {
    orders: getStoredOrders(),
    serverTime: getServerTimeIso(),
  };
}

export function handleExportOrders(): string {
  return exportOrdersJson();
}

/**
 * Full store reset for test isolation.
 */
export function resetMockStore(): void {
  resetServerClock();
  resetReservationStore();
  resetOrderStore();
  initOrders();
}
