import React, { useEffect, useMemo, useState } from 'react';
import { GuardedPricingClient } from '../engine/clientPricing';
import { calculateMaxAddableNow } from '../engine/stockEngine';
import { validate } from '../engine/validateRules';
import type {
  CartLine,
  ItemConfig,
  MenuFixture,
  RuleViolation,
} from '../types/order';

interface BuilderViewProps {
  menu: MenuFixture;
  remainingStock: Record<string, number>;
  editingLine?: CartLine | null;
  onAddToCart: (config: ItemConfig, idempotencyKey: string) => Promise<{ ok: boolean; message?: string }>;
  onSaveEdit?: (lineId: string, newConfig: ItemConfig) => Promise<{ ok: boolean; message?: string; expired?: boolean }>;
  onCancelEdit?: () => void;
}

const pricingClient = new GuardedPricingClient();

export const BuilderView: React.FC<BuilderViewProps> = ({
  menu,
  remainingStock,
  editingLine,
  onAddToCart,
  onSaveEdit,
  onCancelEdit,
}) => {
  const initialSelections = useMemo(() => {
    return editingLine?.config?.selections ? { ...editingLine.config.selections } : {};
  }, [editingLine]);

  const [selections, setSelections] = useState<Record<string, number>>(initialSelections);
  const [quantity, setQuantity] = useState<number>(editingLine?.quantity ?? 1);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `cart_add_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  const [pricingPreview, setPricingPreview] = useState<any>(null);
  const [isPricingLoading, setIsPricingLoading] = useState<boolean>(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [shortageError, setShortageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync state if editingLine changes
  useEffect(() => {
    if (editingLine) {
      setSelections({ ...editingLine.config.selections });
      setQuantity(editingLine.quantity ?? 1);
      setShortageError(null);
    }
  }, [editingLine]);

  const currentConfig: ItemConfig = useMemo(
    () => ({ selections, quantity }),
    [selections, quantity]
  );

  // Live Rule Validation
  const violations: RuleViolation[] = useMemo(() => {
    return validate(currentConfig, menu.groups, menu.rules);
  }, [currentConfig, menu]);

  const isValid = violations.length === 0;

  // Debounced Pricing preview with stale cancellation guard
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const fetchPrice = async () => {
      setIsPricingLoading(true);
      setPricingError(null);

      const result = await pricingClient.requestPrice(async (signal) => {
        const res = await fetch('/api/price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: currentConfig }),
          signal,
        });
        if (!res.ok) {
          throw new Error('Pricing service temporarily unavailable (simulated 15% failure)');
        }
        return res.json();
      });

      if (!result.isStale) {
        setIsPricingLoading(false);
        if (result.pricing) {
          setPricingPreview(result.pricing);
        }
      }
    };

    timer = setTimeout(() => {
      fetchPrice().catch((err: any) => {
        setIsPricingLoading(false);
        setPricingError(err?.message || 'Failed to calculate price');
      });
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [currentConfig]);

  const handleOptionCountChange = (optionId: string, delta: number) => {
    setShortageError(null);
    setSelections((prev) => {
      const current = prev[optionId] || 0;
      const next = Math.max(0, current + delta);
      const copy = { ...prev };
      if (next === 0) {
        delete copy[optionId];
      } else {
        copy[optionId] = next;
      }
      return copy;
    });
  };

  const handleRetryPricing = async () => {
    setIsPricingLoading(true);
    setPricingError(null);
    try {
      const res = await fetch('/api/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: currentConfig }),
      });
      if (!res.ok) throw new Error('Pricing service failed on retry');
      const data = await res.json();
      setPricingPreview(data);
      setIsPricingLoading(false);
    } catch (err: any) {
      setIsPricingLoading(false);
      setPricingError(err?.message || 'Retry failed');
    }
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setShortageError(null);

    try {
      if (editingLine && onSaveEdit) {
        const res = await onSaveEdit(editingLine.id, currentConfig);
        if (!res.ok) {
          setShortageError(res.message || 'Unable to update cart item due to stock conflict.');
        } else {
          // Success
          setSelections({});
          setQuantity(1);
        }
      } else {
        const res = await onAddToCart(currentConfig, idempotencyKey);
        if (!res.ok) {
          setShortageError(res.message || 'Stock shortage: unable to add to cart.');
        } else {
          // Reset form and generate fresh idempotency key for next add
          setSelections({});
          setQuantity(1);
          setIdempotencyKey(`cart_add_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6 flex flex-col gap-6">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {editingLine ? 'Edit Cart Item' : 'Build Custom Breakfast'}
          </h2>
          <p className="text-sm text-slate-500">
            Base price: {(menu.basePricePoisha / 100).toFixed(2)} BDT. Select your options below.
          </p>
        </div>
        {editingLine && onCancelEdit && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-sm px-3 py-1 text-slate-600 hover:text-slate-900 border rounded"
          >
            Cancel Edit
          </button>
        )}
      </div>

      {/* Inline Shortage Error Banner */}
      {shortageError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-lg text-sm flex items-center justify-between"
        >
          <span>{shortageError}</span>
          <button
            type="button"
            onClick={() => setShortageError(null)}
            className="text-xs text-red-600 underline font-semibold ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Option Groups */}
      <div className="space-y-6">
        {menu.groups.map((group) => {
          return (
            <div key={group.id} className="border border-slate-100 rounded-lg p-4 bg-slate-50/50">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-slate-800">
                  {group.name}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    (Min: {group.min}, Max: {group.max}
                    {group.step ? `, Step: ${group.step}` : ''}
                    {group.maxDistinct ? `, Max distinct: ${group.maxDistinct}` : ''})
                  </span>
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {group.options.map((option) => {
                  const currentSelected = selections[option.id] || 0;
                  const maxAddable = calculateMaxAddableNow(
                    option.id,
                    currentConfig,
                    menu.groups,
                    remainingStock,
                    editingLine?.config
                  );

                  const canIncrement = maxAddable > 0;

                  return (
                    <div
                      key={option.id}
                      className={`p-3 bg-white rounded-md border flex items-center justify-between ${
                        currentSelected > 0 ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex-1 pr-2">
                        <div className="text-sm font-medium text-slate-900">{option.name}</div>
                        <div className="text-xs text-slate-500">
                          {option.pricePoisha === 0
                            ? 'Free'
                            : `+${(option.pricePoisha / 100).toFixed(2)} BDT`}
                          {Number.isFinite(maxAddable) && (
                            <span className="ml-1 text-slate-400">
                              (avail: {maxAddable})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stepper Controls */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Decrease ${option.name}`}
                          onClick={() => handleOptionCountChange(option.id, -1)}
                          disabled={currentSelected === 0}
                          className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          -
                        </button>
                        <span className="w-5 text-center text-sm font-semibold text-slate-800">
                          {currentSelected}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase ${option.name}`}
                          onClick={() => handleOptionCountChange(option.id, 1)}
                          disabled={!canIncrement}
                          className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center text-sm font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rule Violations Banner */}
      {violations.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
          <div className="text-sm font-semibold text-amber-900 mb-1">
            Requirements to fulfill:
          </div>
          <ul className="list-disc list-inside text-xs text-amber-800 space-y-1">
            {violations.map((v) => (
              <li key={v.id}>{v.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Price Preview Card */}
      <div className="p-4 bg-slate-900 text-white rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-slate-300">Live Price Estimate</div>
          {isPricingLoading && (
            <span className="text-xs text-indigo-400 animate-pulse">Calculating...</span>
          )}
        </div>

        {pricingError ? (
          <div className="flex items-center justify-between text-xs text-red-300 bg-red-900/40 p-2 rounded">
            <span>{pricingError}</span>
            <button
              type="button"
              onClick={handleRetryPricing}
              className="text-white underline font-semibold ml-2 hover:text-indigo-200"
            >
              Retry
            </button>
          </div>
        ) : pricingPreview ? (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Unit Subtotal:</span>
              <span>{(pricingPreview.step1Poisha / 100).toFixed(2)} BDT</span>
            </div>
            {pricingPreview.step1Poisha !== pricingPreview.step2Poisha && (
              <div className="flex justify-between text-emerald-400">
                <span>P2 Extras Deal:</span>
                <span>
                  -{((pricingPreview.step1Poisha - pricingPreview.step2Poisha) / 100).toFixed(2)} BDT
                </span>
              </div>
            )}
            {pricingPreview.comboDiscountPoisha > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>P1 Combo Deal (10%):</span>
                <span>-{(pricingPreview.comboDiscountPoisha / 100).toFixed(2)} BDT</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-slate-700">
              <span>Unit Price:</span>
              <span>{(pricingPreview.unitPricePoisha / 100).toFixed(2)} BDT</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400">Select options to see price preview.</div>
        )}
      </div>

      {/* Action Footer: Quantity and Add to Cart */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Quantity:</span>
          <div className="flex items-center border rounded">
            {[1, 2, 3].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setQuantity(num)}
                className={`px-3 py-1 text-sm font-medium ${
                  quantity === num ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting
            ? 'Reserving Stock...'
            : editingLine
            ? 'Save Changes'
            : 'Add to Cart'}
        </button>
      </div>
    </div>
  );
};
