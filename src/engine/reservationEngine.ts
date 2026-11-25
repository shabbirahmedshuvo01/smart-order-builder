import appendixMenu from '../fixtures/appendixMenu.json';
import { getServerTimeIso, getServerTimeMs } from '../mocks/serverClock';
import {
  calculateItemIngredients,
  checkStockShortages,
  formatShortageMessage,
} from './stockEngine';
import type {
  CartLine,
  ItemConfig,
  MenuFixture,
  Reservation,
  ReservationResult,
} from '../types/order';

const menu = appendixMenu as MenuFixture;

// In-memory store for active session
let cartLines: CartLine[] = [];
let activeReservations: Reservation[] = [];
const currentSessionSoldStock: Record<string, number> = {};
const addToCartIdempotencyMap = new Map<
  string,
  { line: CartLine; reservation: Reservation }
>();

/**
 * Computes live available stock starting from initialStock
 * minus active non-expired reservations minus sold stock in the current session.
 */
export function getRemainingStock(serverTimeIso = getServerTimeIso()): Record<string, number> {
  cleanupExpiredReservations(serverTimeIso);

  const remaining: Record<string, number> = { ...menu.initialStock };

  // Deduct active reservations
  for (const res of activeReservations) {
    if (res.expiresAtIso > serverTimeIso) {
      for (const [ing, count] of Object.entries(res.ingredients)) {
        remaining[ing] = (remaining[ing] || 0) - count;
      }
    }
  }

  // Deduct current session sold stock
  for (const [ing, count] of Object.entries(currentSessionSoldStock)) {
    remaining[ing] = (remaining[ing] || 0) - count;
  }

  return remaining;
}

/**
 * Cleans up expired reservations at the given serverTime.
 * Any expired item releases its held stock and is marked expired in the cart.
 */
export function cleanupExpiredReservations(serverTimeIso = getServerTimeIso()): void {
  const stillActive: Reservation[] = [];

  for (const res of activeReservations) {
    if (res.expiresAtIso <= serverTimeIso) {
      // Mark corresponding cart line as expired
      const line = cartLines.find((l) => l.id === res.cartLineId);
      if (line) {
        line.expired = true;
      }
    } else {
      stillActive.push(res);
    }
  }

  activeReservations = stillActive;
}

/**
 * Atomically checks stock and adds an item to cart with a 300s reservation.
 * Deduplicates requests sharing the same idempotencyKey.
 */
export function addToCart(
  config: ItemConfig,
  idempotencyKey: string,
  serverTimeIso = getServerTimeIso()
): ReservationResult {
  if (!idempotencyKey) {
    throw new Error('idempotencyKey is required for addToCart');
  }

  // Idempotency check: return exact existing result if already processed
  const cached = addToCartIdempotencyMap.get(idempotencyKey);
  if (cached) {
    return {
      ok: true,
      line: cached.line,
      reservation: cached.reservation,
      deduplicated: true,
    };
  }

  const remaining = getRemainingStock(serverTimeIso);
  const neededIngredients = calculateItemIngredients(config, menu.groups);
  const shortages = checkStockShortages(neededIngredients, remaining);

  if (shortages.length > 0) {
    return {
      ok: false,
      shortages,
      message: formatShortageMessage(shortages),
    };
  }

  // Create new cart line & reservation
  const lineId = `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const resId = `res_${lineId}`;
  const nowMs = getServerTimeMs();
  const expiresAtMs = nowMs + menu.reservationTtlSeconds * 1000;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  const reservation: Reservation = {
    id: resId,
    cartLineId: lineId,
    ingredients: neededIngredients,
    createdAtIso: new Date(nowMs).toISOString(),
    expiresAtIso,
  };

  const line: CartLine = {
    id: lineId,
    config,
    quantity: config.quantity,
    reservationId: resId,
    expired: false,
    expiresAtIso,
  };

  cartLines.push(line);
  activeReservations.push(reservation);
  addToCartIdempotencyMap.set(idempotencyKey, { line, reservation });

  return {
    ok: true,
    line,
    reservation,
  };
}

/**
 * Atomically edits a cart item using net-difference stock checking.
 * If conflict occurs, the original reservation remains completely untouched.
 */
export function editCartItem(
  lineId: string,
  newConfig: ItemConfig,
  serverTimeIso = getServerTimeIso()
): ReservationResult {
  cleanupExpiredReservations(serverTimeIso);

  const line = cartLines.find((l) => l.id === lineId);
  if (!line) {
    return {
      ok: false,
      message: 'Item not found in cart',
    };
  }

  if (line.expired) {
    return {
      ok: false,
      expired: true,
      message: 'Reservation expired and stock was released',
    };
  }

  const reservation = activeReservations.find((r) => r.cartLineId === lineId);
  const currentHeldIngredients = reservation ? { ...reservation.ingredients } : {};

  // Net difference available stock: remaining stock + what this item currently holds
  const remaining = getRemainingStock(serverTimeIso);
  const availableForEdit: Record<string, number> = { ...remaining };
  for (const [ing, count] of Object.entries(currentHeldIngredients)) {
    availableForEdit[ing] = (availableForEdit[ing] || 0) + count;
  }

  const neededIngredients = calculateItemIngredients(newConfig, menu.groups);
  const shortages = checkStockShortages(neededIngredients, availableForEdit);

  if (shortages.length > 0) {
    // Conflict: leave original reservation intact!
    return {
      ok: false,
      shortages,
      message: formatShortageMessage(shortages),
    };
  }

  // Update reservation and cart line
  if (reservation) {
    reservation.ingredients = neededIngredients;
  }
  line.config = newConfig;
  line.quantity = newConfig.quantity;

  return {
    ok: true,
    line,
    reservation,
  };
}

/**
 * Removes an item from cart and releases any held reservation.
 */
export function removeCartItem(lineId: string): { ok: boolean } {
  cartLines = cartLines.filter((l) => l.id !== lineId);
  activeReservations = activeReservations.filter((r) => r.cartLineId !== lineId);
  return { ok: true };
}

/**
 * Returns current cart lines.
 */
export function getCart(): CartLine[] {
  return [...cartLines];
}

/**
 * Returns active reservations.
 */
export function getReservations(): Reservation[] {
  return [...activeReservations];
}

/**
 * Marks current cart reservations as sold stock and clears the cart.
 */
export function consumeReservationsForCheckout(): void {
  for (const res of activeReservations) {
    for (const [ing, count] of Object.entries(res.ingredients)) {
      currentSessionSoldStock[ing] = (currentSessionSoldStock[ing] || 0) + count;
    }
  }
  cartLines = [];
  activeReservations = [];
}

/**
 * Resets the in-memory reservation and cart store.
 */
export function resetReservationStore(): void {
  cartLines = [];
  activeReservations = [];
  for (const key of Object.keys(currentSessionSoldStock)) {
    delete currentSessionSoldStock[key];
  }
  addToCartIdempotencyMap.clear();
}
