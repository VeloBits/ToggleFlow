/**
 * Read-only traversal of everywhere a project states targeting: `segments.rules`
 * and every environment's `flag_states.targeting_rules`.
 *
 * Two endpoints need the same walk - "which flags use this segment" and "what
 * attributes does this project talk about" - so the walk lives here once. Both
 * are derived views over jsonb that no index covers, which is exactly why they
 * are their own endpoints rather than columns: the answer is computed on demand
 * and never stored, so it cannot go stale.
 *
 * Everything here is DEFENSIVE about shape. `targeting_rules` is
 * `jsonb.$type<unknown[]>()` - the type parameter is a promise TypeScript makes
 * about rows this process wrote, not a guarantee about rows already in the table,
 * and a malformed row must degrade to "contributes nothing" rather than 500 a
 * page that is only trying to count references.
 */
import type { Condition } from '@toggleflow/engine';
import { UNSUPPORTED_SENTINEL_ATTRIBUTE } from '@toggleflow/engine';

/** A condition-shaped object, as loosely as we dare believe it. */
interface LooseCondition {
  attribute?: unknown;
  operator?: unknown;
  value?: unknown;
  values?: unknown;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Flattens a segment's stored `Condition[][]` into every condition it contains. */
export function conditionsInRules(rules: unknown): LooseCondition[] {
  if (!Array.isArray(rules)) return [];
  return rules.flatMap((group) => (Array.isArray(group) ? group.filter(isRecord) : []));
}

/**
 * Every segment key referenced by one environment's targeting rules.
 *
 * Duplicates are preserved; callers that want a set say so. A rule listing the
 * same segment twice is degenerate but not illegal.
 */
export function segmentKeysInTargetingRules(targetingRules: unknown): string[] {
  if (!Array.isArray(targetingRules)) return [];
  return targetingRules.flatMap((rule) => {
    if (!isRecord(rule) || !Array.isArray(rule.segments)) return [];
    return rule.segments.filter((key): key is string => typeof key === 'string');
  });
}

/** Every inline condition across one environment's targeting rules. */
export function conditionsInTargetingRules(targetingRules: unknown): LooseCondition[] {
  if (!Array.isArray(targetingRules)) return [];
  return targetingRules.flatMap((rule) => {
    if (!isRecord(rule) || !Array.isArray(rule.conditions)) return [];
    return rule.conditions.filter(isRecord);
  });
}

/** One attribute the project's rules mention, with the values seen alongside it. */
export interface AttributeSummary {
  name: string;
  /**
   * Distinct literals this attribute has been compared against, so the value
   * field can suggest `pro`/`team` once someone picks `plan`. Capped, and the
   * cap is silent by design - this is a suggestion list, not a report.
   */
  valueSamples: (string | number | boolean)[];
  /** How many conditions across the project reference this attribute. */
  usageCount: number;
}

const MAX_VALUE_SAMPLES = 25;

/**
 * Folds conditions into per-attribute summaries, sorted most-used first so the
 * suggestion list leads with what this project actually targets on.
 *
 * The sentinel attribute is filtered out: it appears in the SNAPSHOT rather than
 * in `segments.rules`, so it should never reach here, but suggesting the one
 * attribute guaranteed to match nobody would be a uniquely unhelpful bug.
 */
export function summarizeAttributes(conditions: LooseCondition[]): AttributeSummary[] {
  const byName = new Map<string, { count: number; values: Set<string | number | boolean> }>();

  for (const condition of conditions) {
    const name = condition.attribute;
    if (typeof name !== 'string' || name.length === 0) continue;
    if (name === UNSUPPORTED_SENTINEL_ATTRIBUTE) continue;

    let entry = byName.get(name);
    if (!entry) {
      entry = { count: 0, values: new Set() };
      byName.set(name, entry);
    }
    entry.count += 1;

    // `value` for the scalar operators, `values` for in/notIn, neither for exists.
    const literals = Array.isArray(condition.values)
      ? condition.values
      : condition.value === undefined
        ? []
        : [condition.value];
    for (const literal of literals) {
      if (entry.values.size >= MAX_VALUE_SAMPLES) break;
      const t = typeof literal;
      if (t === 'string' || t === 'number' || t === 'boolean') {
        entry.values.add(literal as string | number | boolean);
      }
    }
  }

  return [...byName.entries()]
    .map(([name, { count, values }]) => ({
      name,
      usageCount: count,
      // Stable order so the dropdown does not reshuffle between requests.
      valueSamples: [...values].sort((a, b) => String(a).localeCompare(String(b))),
    }))
    .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
}

/** Narrowing helper for callers that hold real `Condition`s and want the loose view. */
export const asLoose = (conditions: Condition[]): LooseCondition[] => conditions;
