import React, { useEffect, useMemo, useState } from 'react';
import { priceCart } from '../engine/pricingEngine';
import { computeServerClockOffset } from '../mocks/serverClock';
import type { CartLine, MenuFixture, StoredOrder } from '../types/order';

interface CartPanelProps {
  cart: CartLine[];
  menu: MenuFixture;
  serverTimeIso: string;
  onRemoveItem: (lineId: string) => void;
  onEditItem: (line: CartLine) => void;
  onCheckout: (
    paymentMethod: 'card' | 'bkash' | 'cash',
    couponCode: string | null,
    checkoutIdempotencyKey: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onExportOrders: () => void;
  pastOrders: StoredOrder[];
}

export const CartPanel: React.FC<CartPanelProps> = ({
  cart,
  menu,
  serverTimeIso,
  onRemoveItem,
  onEditItem,
  onCheckout,
  onExportOrders,
  pastOrders,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bkash' | 'cash'>('bkash');
  const [couponInput, setCouponInput] = useState<string>('MORNING15');
  const [checkoutKey, setCheckoutKey] = useState<string>(
    () => `checkout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showPastOrders, setShowPastOrders] = useState<boolean>(false);

  // Tick clock every second for live countdown
  const [, setTick] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const clockOffsetMs = useMemo(() => {
    return computeServerClockOffset(serverTimeIso);
  }, [serverTimeIso]);

  // Pricing calculation
  const pricing = useMemo(() => {
    return priceCart(cart, menu, couponInput || null, serverTimeIso);
  }, [cart, menu, couponInput, serverTimeIso]);

  // Check if any cart item is expired based on server time
  const hasExpiredItems = useMemo(() => {
    const nowServerMs = Date.now() + clockOffsetMs;
    return cart.some((line) => {
      if (line.expired) return true;
      if (line.expiresAtIso) {
        return new Date(line.expiresAtIso).getTime() <= nowServerMs;
      }
      return false;
    });
  }, [cart, clockOffsetMs]);

  const handlePay = async () => {
    if (cart.length === 0 || hasExpiredItems || isCheckingOut) return;
    setIsCheckingOut(true);
    setCheckoutError(null);

    try {
      const res = await onCheckout(paymentMethod, couponInput || null, checkoutKey);
      if (!res.ok) {
        setCheckoutError(res.message || 'Checkout failed');
      } else {
        // Regenerate key for future checkouts
        setCheckoutKey(`checkout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      }
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <h2 className="text-xl font-bold text-slate-900">Your Cart ({cart.length})</h2>
        <button
          type="button"
          onClick={onExportOrders}
          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold px-3 py-1.5 rounded-lg border border-slate-300 transition-colors"
        >
          Download orders.json
        </button>
      </div>

      {/* Cart Items List */}
      {cart.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 rounded-lg border border-dashed">
          Your cart is currently empty. Build a custom breakfast to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {cart.map((line, idx) => {
            const nowServerMs = Date.now() + clockOffsetMs;
            const expiresAtMs = line.expiresAtIso ? new Date(line.expiresAtIso).getTime() : 0;
            const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - nowServerMs) / 1000));
            const isExpired = line.expired || remainingSeconds === 0;

            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

            return (
              <div
                key={line.id}
                className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isExpired ? 'bg-red-50/50 border-red-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-800">
                      Item #{idx + 1} (Qty: {line.quantity ?? line.config.quantity})
                    </span>
                    {isExpired ? (
                      <span className="text-xs px-2 py-0.5 font-bold bg-red-600 text-white rounded">
                        Expired
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 font-semibold bg-emerald-100 text-emerald-800 rounded">
                        Expires in {formattedTime}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {Object.entries(line.config.selections || {})
                      .filter(([, count]) => count > 0)
                      .map(([optId, count]) => `${optId} x${count}`)
                      .join(', ')}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEditItem(line)}
                    disabled={isExpired}
                    className="text-xs px-3 py-1 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(line.id)}
                    className="text-xs px-3 py-1 bg-white border border-red-200 rounded text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Checkout Section */}
      {cart.length > 0 && (
        <div className="border-t pt-4 space-y-4">
          {/* Coupon Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Coupon Code:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="e.g. MORNING15"
                className="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {pricing.couponRejectedReason && (
              <p className="text-xs text-amber-600 mt-1">{pricing.couponRejectedReason}</p>
            )}
            {pricing.couponApplied && (
              <p className="text-xs text-emerald-600 font-semibold mt-1">
                Coupon {pricing.couponApplied} applied!
              </p>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Method:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['card', 'bkash', 'cash'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-1.5 text-xs font-semibold uppercase rounded-lg border ${
                    paymentMethod === method
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing Summary */}
          <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1.5 border border-slate-200">
            <div className="flex justify-between text-slate-600">
              <span>Cart Subtotal:</span>
              <span>{(pricing.subtotalPoisha / 100).toFixed(2)} BDT</span>
            </div>
            {pricing.discountPoisha > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Discount ({pricing.appliedPromoCode}):</span>
                <span>-{(pricing.discountPoisha / 100).toFixed(2)} BDT</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>5% VAT:</span>
              <span>{(pricing.vatPoisha / 100).toFixed(2)} BDT</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t">
              <span>Total Payable:</span>
              <span>{pricing.payableBdt} BDT</span>
            </div>
          </div>

          {/* Checkout Error */}
          {checkoutError && (
            <div role="alert" className="p-3 bg-red-50 border border-red-300 text-red-700 rounded-lg text-xs">
              {checkoutError}
            </div>
          )}

          {/* Pay Button */}
          <button
            type="button"
            onClick={handlePay}
            disabled={isCheckingOut || hasExpiredItems}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isCheckingOut ? 'Processing Payment...' : `Pay ${pricing.payableBdt} BDT`}
          </button>
          {hasExpiredItems && (
            <p className="text-xs text-center text-red-600">
              Please remove or re-add expired items before paying.
            </p>
          )}
        </div>
      )}

      {/* Past Orders Accordion */}
      <div className="border-t pt-4">
        <button
          type="button"
          onClick={() => setShowPastOrders((prev) => !prev)}
          className="w-full flex justify-between items-center text-xs font-semibold text-slate-700 hover:text-slate-900"
        >
          <span>Order History ({pastOrders.length} orders)</span>
          <span>{showPastOrders ? '▲ Hide' : '▼ Show'}</span>
        </button>

        {showPastOrders && (
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
            {pastOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-2 bg-slate-50 border rounded text-xs flex justify-between items-center"
              >
                <div>
                  <div className="font-semibold text-slate-800">{ord.id}</div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(ord.createdAt).toLocaleDateString()} via {ord.paymentMethod}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900">{ord.pricing.payableBdt} BDT</div>
                  {ord.pricing.appliedPromoCode && (
                    <div className="text-[10px] text-emerald-600 font-medium">
                      {ord.pricing.appliedPromoCode}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
