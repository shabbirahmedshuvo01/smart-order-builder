import type { MenuFixture, StoredOrder } from '../types/order';

/**
 * Extracts YYYY-MM-DD formatted date in Asia/Dhaka (+06:00) timezone.
 */
export function getDhakaDateString(isoString: string): string {
  const d = new Date(isoString);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Tool 1: Total order count
 */
export function getOrderCount(orders: StoredOrder[]): { count: number } {
  return { count: orders.length };
}

/**
 * Tool 2: Total revenue in BDT and integer poisha
 */
export function getTotalRevenue(orders: StoredOrder[]): {
  totalRevenueBdt: number;
  totalRevenuePoisha: number;
} {
  let totalRevenueBdt = 0;
  let totalRevenuePoisha = 0;

  for (const order of orders) {
    totalRevenueBdt += order.pricing.payableBdt;
    // Poisha source of truth: discountedSubtotalPoisha + vatPoisha
    totalRevenuePoisha +=
      order.pricing.discountedSubtotalPoisha + order.pricing.vatPoisha;
  }

  return { totalRevenueBdt, totalRevenuePoisha };
}

/**
 * Tool 3: Best-selling option by units across all orders
 */
export function getBestSellingOption(
  orders: StoredOrder[],
  menu: MenuFixture
): {
  optionId: string;
  optionName: string;
  totalUnits: number;
  breakdown: Array<{ optionId: string; optionName: string; totalUnits: number }>;
} {
  const optionNameMap = new Map<string, string>();
  for (const group of menu.groups) {
    for (const opt of group.options) {
      optionNameMap.set(opt.id, opt.name);
    }
  }

  const unitsMap: Record<string, number> = {};

  for (const order of orders) {
    for (const item of order.items) {
      const itemQty = item.quantity || 1;
      for (const [optId, count] of Object.entries(item.selections || {})) {
        if (typeof count === 'number' && count > 0) {
          unitsMap[optId] = (unitsMap[optId] || 0) + count * itemQty;
        }
      }
    }
  }

  const breakdown = Object.entries(unitsMap)
    .map(([optionId, totalUnits]) => ({
      optionId,
      optionName: optionNameMap.get(optionId) || optionId,
      totalUnits,
    }))
    .sort((a, b) => b.totalUnits - a.totalUnits);

  const top = breakdown[0] || {
    optionId: 'none',
    optionName: 'None',
    totalUnits: 0,
  };

  return {
    optionId: top.optionId,
    optionName: top.optionName,
    totalUnits: top.totalUnits,
    breakdown,
  };
}

/**
 * Tool 4: Revenue breakdown by payment method
 */
export function getRevenueByPaymentMethod(orders: StoredOrder[]): {
  breakdown: Record<string, number>;
  topMethod: string;
  topRevenueBdt: number;
} {
  const breakdown: Record<string, number> = {};

  for (const order of orders) {
    const method = order.paymentMethod || 'other';
    breakdown[method] = (breakdown[method] || 0) + order.pricing.payableBdt;
  }

  let topMethod = 'none';
  let topRevenueBdt = 0;

  for (const [method, rev] of Object.entries(breakdown)) {
    if (rev > topRevenueBdt) {
      topRevenueBdt = rev;
      topMethod = method;
    }
  }

  return { breakdown, topMethod, topRevenueBdt };
}

/**
 * Tool 5: Average order value
 */
export function getAverageOrderValue(orders: StoredOrder[]): {
  averageBdt: number;
  averagePoisha: number;
  orderCount: number;
} {
  if (orders.length === 0) {
    return { averageBdt: 0, averagePoisha: 0, orderCount: 0 };
  }

  const { totalRevenueBdt, totalRevenuePoisha } = getTotalRevenue(orders);
  const averageBdt = Number((totalRevenueBdt / orders.length).toFixed(2));
  const averagePoisha = Math.round(totalRevenuePoisha / orders.length);

  return {
    averageBdt,
    averagePoisha,
    orderCount: orders.length,
  };
}

/**
 * Tool 6: Orders that actually received a coupon vs rejected
 */
export function getCouponAppliedStats(orders: StoredOrder[]): {
  appliedCount: number;
  rejectedCount: number;
  details: Array<{
    orderId: string;
    enteredCode: string | null;
    appliedCode: string | null;
    rejectedReason: string | null;
  }>;
} {
  let appliedCount = 0;
  let rejectedCount = 0;
  const details = [];

  for (const order of orders) {
    const entered = order.coupon?.enteredCode || null;
    const applied = order.coupon?.appliedCode || null;
    const reason = order.coupon?.rejectedReason || null;

    if (applied) {
      appliedCount += 1;
    } else if (entered) {
      rejectedCount += 1;
    }

    details.push({
      orderId: order.id,
      enteredCode: entered,
      appliedCode: applied,
      rejectedReason: reason,
    });
  }

  return {
    appliedCount,
    rejectedCount,
    details,
  };
}

/**
 * Tool 7: Orders on a specific date in Asia/Dhaka
 */
export function getOrdersByDate(
  orders: StoredOrder[],
  date: string
): {
  date: string;
  count: number;
  orderIds: string[];
  revenueBdt: number;
} {
  const targetDate = date.trim();
  const filtered = orders.filter(
    (order) => getDhakaDateString(order.createdAt) === targetDate
  );

  const revenueBdt = filtered.reduce(
    (sum, order) => sum + order.pricing.payableBdt,
    0
  );

  return {
    date: targetDate,
    count: filtered.length,
    orderIds: filtered.map((o) => o.id),
    revenueBdt,
  };
}
