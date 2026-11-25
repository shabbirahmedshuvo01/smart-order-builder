import { delay, http, HttpResponse } from 'msw';
import {
  getMenu,
  getSimulationConfig,
  getStoreState,
  handleAddToCart,
  handleCheckout,
  handleEditCartItem,
  handleExportOrders,
  handleGetOrders,
  handleRemoveCartItem,
  price,
} from './mockStore';
import type { CartLine, ItemConfig } from '../types/order';

export const handlers = [
  // GET /api/menu
  http.get('/api/menu', () => {
    return HttpResponse.json(getMenu());
  }),

  // POST /api/price
  http.post('/api/price', async ({ request }) => {
    const sim = getSimulationConfig();

    if (sim.enabled) {
      // Simulate network latency (200-1500ms)
      const latency =
        Math.floor(Math.random() * (sim.latencyMaxMs - sim.latencyMinMs)) +
        sim.latencyMinMs;
      if (latency > 0) {
        await delay(latency);
      }

      // Simulate 15% random failure rate
      if (Math.random() < sim.failureRate) {
        return new HttpResponse(
          JSON.stringify({ error: 'Simulated pricing service failure' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    try {
      const body = (await request.json()) as {
        cart?: CartLine[];
        config?: ItemConfig;
        couponCode?: string | null;
      };
      const pricing = price(body.cart, body.config, body.couponCode);
      return HttpResponse.json(pricing);
    } catch {
      return HttpResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
  }),

  // GET /api/state
  http.get('/api/state', () => {
    return HttpResponse.json(getStoreState());
  }),

  // POST /api/cart/items
  http.post('/api/cart/items', async ({ request }) => {
    try {
      const body = (await request.json()) as {
        config: ItemConfig;
        idempotencyKey: string;
      };
      const result = handleAddToCart(body.config, body.idempotencyKey);
      if (!result.ok) {
        return HttpResponse.json(result, { status: 409 });
      }
      return HttpResponse.json(result, { status: 200 });
    } catch (err: any) {
      return HttpResponse.json({ error: err?.message || 'Error adding to cart' }, { status: 400 });
    }
  }),

  // PATCH /api/cart/items/:lineId
  http.patch('/api/cart/items/:lineId', async ({ params, request }) => {
    try {
      const lineId = String(params.lineId);
      const body = (await request.json()) as { config: ItemConfig };
      const result = handleEditCartItem(lineId, body.config);
      if (!result.ok) {
        return HttpResponse.json(result, { status: 409 });
      }
      return HttpResponse.json(result, { status: 200 });
    } catch (err: any) {
      return HttpResponse.json({ error: err?.message || 'Error updating cart item' }, { status: 400 });
    }
  }),

  // DELETE /api/cart/items/:lineId
  http.delete('/api/cart/items/:lineId', ({ params }) => {
    const lineId = String(params.lineId);
    const result = handleRemoveCartItem(lineId);
    return HttpResponse.json(result, { status: 200 });
  }),

  // POST /api/checkout
  http.post('/api/checkout', async ({ request }) => {
    try {
      const body = (await request.json()) as {
        paymentMethod: 'card' | 'bkash' | 'cash';
        couponCode: string | null;
        checkoutIdempotencyKey: string;
      };
      const result = handleCheckout(
        body.paymentMethod,
        body.couponCode,
        body.checkoutIdempotencyKey
      );
      if (!result.ok) {
        return HttpResponse.json(result, { status: result.expired ? 409 : 400 });
      }
      return HttpResponse.json(result, { status: 200 });
    } catch (err: any) {
      return HttpResponse.json({ error: err?.message || 'Error during checkout' }, { status: 400 });
    }
  }),

  // GET /api/orders
  http.get('/api/orders', () => {
    return HttpResponse.json(handleGetOrders());
  }),

  // GET /api/orders/export
  http.get('/api/orders/export', () => {
    const json = handleExportOrders();
    return new HttpResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="orders.json"',
      },
    });
  }),
];
