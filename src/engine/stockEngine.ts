import type {
  IngredientShortage,
  ItemConfig,
  MenuOption,
  OptionGroup,
  Reservation,
  StoredOrder,
} from '../types/order';

/**
 * Builds an option lookup map from option groups.
 */
function getOptionMap(groups: OptionGroup[]): Map<string, MenuOption> {
  const map = new Map<string, MenuOption>();
  for (const group of groups) {
    for (const opt of group.options) {
      map.set(opt.id, opt);
    }
  }
  return map;
}

/**
 * Calculates total ingredient usage for a given ItemConfig (multiplied by quantity).
 */
export function calculateItemIngredients(
  config: ItemConfig,
  groups: OptionGroup[]
): Record<string, number> {
  const optionMap = getOptionMap(groups);
  const result: Record<string, number> = {};
  const qty = config.quantity || 1;

  for (const [optionId, count] of Object.entries(config.selections || {})) {
    if (count <= 0) continue;
    const opt = optionMap.get(optionId);
    if (!opt || !opt.ingredients) continue;

    for (const [ingredient, perOption] of Object.entries(opt.ingredients)) {
      if (perOption <= 0) continue;
      const needed = perOption * count * qty;
      result[ingredient] = (result[ingredient] || 0) + needed;
    }
  }

  return result;
}

/**
 * Computes remaining available stock by subtracting active reservations
 * and sold orders from initial stock.
 */
export function computeRemainingStock(
  initialStock: Record<string, number>,
  reservations: Reservation[],
  soldOrders: StoredOrder[] = [],
  nowIso?: string
): Record<string, number> {
  const remaining = { ...initialStock };

  // Deduct active reservations (ignore expired if nowIso provided)
  for (const res of reservations) {
    if (nowIso && res.expiresAtIso <= nowIso) {
      continue;
    }
    for (const [ingredient, count] of Object.entries(res.ingredients || {})) {
      remaining[ingredient] = (remaining[ingredient] || 0) - count;
    }
  }

  // Deduct sold orders if provided
  for (const order of soldOrders) {
    for (const item of order.items) {
      // If sold order item includes an ingredients breakdown
      const itemRecord = item as unknown as { ingredients?: Record<string, number> };
      if (itemRecord.ingredients) {
        for (const [ingredient, count] of Object.entries(itemRecord.ingredients)) {
          remaining[ingredient] = (remaining[ingredient] || 0) - count * (item.quantity || 1);
        }
      }
    }
  }

  return remaining;
}

/**
 * Compares requested ingredients against available stock and returns any shortages.
 */
export function checkStockShortages(
  requestedIngredients: Record<string, number>,
  availableStock: Record<string, number>
): IngredientShortage[] {
  const shortages: IngredientShortage[] = [];

  for (const [ingredient, needed] of Object.entries(requestedIngredients)) {
    const available = availableStock[ingredient] ?? 0;
    if (needed > available) {
      shortages.push({
        ingredient,
        shortBy: needed - available,
      });
    }
  }

  return shortages;
}

/**
 * Formats a list of shortages into the human-readable string (e.g. "Short: 2 egg, 2 cheese").
 */
export function formatShortageMessage(shortages: IngredientShortage[]): string {
  if (shortages.length === 0) {
    return '';
  }
  return `Short: ${shortages.map((s) => `${s.shortBy} ${s.ingredient}`).join(', ')}`;
}

/**
 * Calculates how many more units of optionId can be added in the builder,
 * accounting for current selections in progress and any stock released
 * if editing an existing cart line.
 */
export function calculateMaxAddableNow(
  optionId: string,
  currentConfig: ItemConfig,
  groups: OptionGroup[],
  remainingStock: Record<string, number>,
  editingLineConfig?: ItemConfig
): number {
  const optionMap = getOptionMap(groups);
  const opt = optionMap.get(optionId);
  if (!opt) return 0;

  // If option has no ingredients, it is not stock-constrained
  if (!opt.ingredients || Object.keys(opt.ingredients).length === 0) {
    return Infinity;
  }

  // Calculate base available stock + ingredients returned from original line (if editing)
  const effectiveAvailable: Record<string, number> = { ...remainingStock };
  if (editingLineConfig) {
    const releasedIngredients = calculateItemIngredients(editingLineConfig, groups);
    for (const [ing, count] of Object.entries(releasedIngredients)) {
      effectiveAvailable[ing] = (effectiveAvailable[ing] || 0) + count;
    }
  }

  // Subtract what currentConfig is already using
  const currentConsumed = calculateItemIngredients(currentConfig, groups);
  const freeStock: Record<string, number> = { ...effectiveAvailable };
  for (const [ing, count] of Object.entries(currentConsumed)) {
    freeStock[ing] = (freeStock[ing] || 0) - count;
  }

  // Determine how many additional units of optionId can fit
  let maxAddable = Infinity;
  const qty = currentConfig.quantity || 1;

  for (const [ing, perOption] of Object.entries(opt.ingredients)) {
    if (perOption <= 0) continue;
    const availableForIng = freeStock[ing] ?? 0;
    const canAdd = Math.floor(availableForIng / (perOption * qty));
    if (canAdd < maxAddable) {
      maxAddable = canAdd;
    }
  }

  return Math.max(0, maxAddable === Infinity ? 0 : maxAddable);
}
