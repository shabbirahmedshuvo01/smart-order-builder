import type { CrossGroupRule, ItemConfig, OptionGroup, RuleViolation } from '../types/order';

/**
 * Validates an ItemConfig against menu option groups and cross-group rules.
 * All logic is purely data-driven with no hardcoded IDs, names, or limits.
 * Collects and returns all violations.
 */
export function validate(
  config: ItemConfig,
  groups: OptionGroup[],
  rules: CrossGroupRule[]
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const selections = config.selections || {};

  // 1. Evaluate overrideLimit rules dynamically
  const groupMaxOverrides = new Map<string, number>();
  for (const rule of rules) {
    if (rule.type === 'overrideLimit') {
      const triggerCount = selections[rule.triggerOptionId] || 0;
      if (triggerCount > 0) {
        const existing = groupMaxOverrides.get(rule.targetGroupId);
        groupMaxOverrides.set(
          rule.targetGroupId,
          existing !== undefined ? Math.min(existing, rule.max) : rule.max
        );
      }
    }
  }

  // 2. Validate group-level constraints
  for (const group of groups) {
    let totalCount = 0;
    let distinctCount = 0;

    for (const opt of group.options) {
      const count = selections[opt.id] || 0;
      if (count > 0) {
        totalCount += count;
        distinctCount += 1;

        if (group.maxPerOption !== undefined && count > group.maxPerOption) {
          violations.push({
            id: `${group.id}_maxPerOption_${opt.id}`,
            groupId: group.id,
            message: `${opt.name} allows at most ${group.maxPerOption} unit(s), but found ${count}`,
          });
        }
      }
    }

    // Min check
    if (totalCount < group.min) {
      violations.push({
        id: `${group.id}_min`,
        groupId: group.id,
        message: `${group.name} requires at least ${group.min} selection(s), but found ${totalCount}`,
      });
    }

    // Dynamic Max check (with overrideLimit applied)
    const effectiveMax = groupMaxOverrides.get(group.id) ?? group.max;
    if (totalCount > effectiveMax) {
      violations.push({
        id: `${group.id}_max`,
        groupId: group.id,
        message: `${group.name} allows at most ${effectiveMax} selection(s), but found ${totalCount}`,
      });
    }

    // Step check
    if (group.step !== undefined && group.step > 0 && totalCount > 0) {
      if ((totalCount - group.min) % group.step !== 0) {
        violations.push({
          id: `${group.id}_step`,
          groupId: group.id,
          message: `${group.name} count must increment from ${group.min} in steps of ${group.step}`,
        });
      }
    }

    // Max distinct options check
    if (group.maxDistinct !== undefined && distinctCount > group.maxDistinct) {
      violations.push({
        id: `${group.id}_maxDistinct`,
        groupId: group.id,
        message: `${group.name} allows at most ${group.maxDistinct} distinct option(s), but found ${distinctCount}`,
      });
    }
  }

  // 3. Validate cross-group requires and excludes rules
  for (const rule of rules) {
    if (rule.type === 'requires') {
      const triggerCount = selections[rule.optionId] || 0;
      if (triggerCount > 0) {
        const hasRequired = rule.requiredAnyOf.some(
          (reqId) => (selections[reqId] || 0) > 0
        );
        if (!hasRequired) {
          violations.push({
            id: rule.id,
            message: rule.message,
          });
        }
      }
    } else if (rule.type === 'excludes') {
      const triggerCount = selections[rule.optionId] || 0;
      if (triggerCount > 0) {
        const hasExcluded = rule.excludedOptions.some(
          (exId) => (selections[exId] || 0) > 0
        );
        if (hasExcluded) {
          violations.push({
            id: rule.id,
            message: rule.message,
          });
        }
      }
    }
  }

  return violations;
}
