/**
 * Flag evaluation over a parsed ruleset snapshot.
 *
 * Precedence (frozen alongside the v1 schema):
 *   kill switch  >  targeting rules (first match wins)  >  % rollout  >  default (on)
 */
import { flagType, type FlagValueType } from './flag-types';
import { stableBucket } from './hash';
import type {
  AttributeValue,
  Condition,
  JsonObject,
  JsonValue,
  RulesetSnapshot,
  Segment,
  SnapshotTool,
  TargetingRule,
  UserContext,
} from './schema';

export type EvaluationReason = 'kill_switch' | 'targeting' | 'rollout' | 'default' | 'not_found';

export interface ToolEvaluation {
  key: string;
  /**
   * Whether the flag is serving its on-value. UNCHANGED in meaning and type by
   * the typed-value work, which is what lets `isEnabled()`, the React
   * `useFlag()` hook and the SDK middleware keep working untouched: for a
   * boolean flag this is still the answer, and for a string flag it is still
   * the honest answer to "is this on".
   */
  enabled: boolean;
  reason: EvaluationReason;
  /**
   * ADDITIVE. The value served to this user. For `boolean` flags this equals
   * `enabled`; for the others it is the resolved string (or `config.fallback`
   * when off). Computed by `resolveValue`'s sibling logic in `served()` below,
   * so the dashboard's value cell and the SDK agree by construction.
   */
  value: JsonValue | null;
  /** ADDITIVE. Echoed so a caller can narrow `value` without a second lookup. */
  valueType: FlagValueType;
  /** The tool's live config value (null when none is set, or the tool is unknown). */
  config: JsonObject | null;
  /** `config.fallback` when present - what to serve when the tool is disabled. */
  fallback: JsonValue | null;
}

/**
 * Whether one attribute test passes.
 *
 * Exported because the dashboard's segment preview explains a result condition by
 * condition ("plan is one of [pro, team] ✓"), and the only way for that
 * explanation to be guaranteed true is for it to come from the evaluator the edge
 * actually runs. A second implementation in the UI would agree until the tenth
 * operator, and then quietly disagree.
 *
 * A missing attribute fails EVERY operator, `exists` and the negative ones
 * included - rules only fire on known data, so `neq` against an absent attribute
 * is false rather than true.
 */
export function matchesCondition(
  condition: Condition,
  attributes: Record<string, AttributeValue>,
): boolean {
  const value = attributes[condition.attribute];
  if (value === undefined) return false;
  switch (condition.operator) {
    case 'eq':
      return value === condition.value;
    case 'neq':
      return value !== condition.value;
    case 'in':
      return condition.values.includes(value);
    case 'notIn':
      return !condition.values.includes(value);
    case 'gt':
      return typeof value === 'number' && value > condition.value;
    case 'gte':
      return typeof value === 'number' && value >= condition.value;
    case 'lt':
      return typeof value === 'number' && value < condition.value;
    case 'lte':
      return typeof value === 'number' && value <= condition.value;
    case 'exists':
      return true;
  }
}

/**
 * Whether a user falls in a segment.
 *
 * `ruleSets` wins when present and `conditions` is then ignored, because for a
 * multi-set segment `conditions` holds only the fail-closed sentinel written for
 * readers that predate `ruleSets` - see `segmentSchema`. Evaluating both would
 * mean this evaluator honouring a placeholder addressed to someone else, and no
 * multi-set segment would ever match.
 *
 * An empty `ruleSets` falls through to `conditions`, which is every segment
 * written before this field existed and every single-AND-group segment written
 * since.
 */
export function matchesSegment(
  segment: Segment,
  attributes: Record<string, AttributeValue>,
): boolean {
  const all = (set: { conditions: Condition[] }) =>
    set.conditions.every((c) => matchesCondition(c, attributes));

  if (segment.ruleSets.length === 0)
    return segment.conditions.every((c) => matchesCondition(c, attributes));
  /*
   * `some`/`every` over the sets. Note the degenerate cases differ and both are
   * deliberate: `any` over zero sets is unreachable (guarded above), while an
   * empty AND-group inside `ruleSets` matches everyone - the same thing an empty
   * `conditions` has always meant.
   */
  return segment.match === 'any' ? segment.ruleSets.some(all) : segment.ruleSets.every(all);
}

function matchesRule(
  rule: TargetingRule,
  snapshot: RulesetSnapshot,
  context: UserContext,
): boolean {
  const attributes = context.attributes;
  if (!rule.conditions.every((c) => matchesCondition(c, attributes))) return false;
  if (rule.segments.length === 0) return true;
  return rule.segments.some((segmentKey) => {
    const segment = snapshot.segments[segmentKey];
    if (!segment) return false;
    return matchesSegment(segment, attributes);
  });
}

function evaluate(
  key: string,
  tool: SnapshotTool,
  snapshot: RulesetSnapshot,
  context: UserContext,
): ToolEvaluation {
  const config = tool.config;
  const fallback = config?.fallback ?? null;
  const valueType = tool.valueType;

  /**
   * What this flag serves, given the on/off outcome a branch below arrived at.
   *
   * Boolean flags serve `enabled` itself. Every other type serves its value
   * while on and `config.fallback` while off - so "off" for a string flag is
   * not an empty string or a lie, it is the documented fallback contract, and a
   * rule that matches with `enabled: false` is as much a kill as the switch is.
   *
   * `ruleValue !== undefined` rather than `??`: a rule may deliberately serve
   * null, and that has to beat the flag's value rather than fall through it.
   */
  const served = (on: boolean, ruleValue?: JsonValue): JsonValue | null => {
    if (flagType(valueType).derivesFromEnabled) return on;
    if (!on) return fallback;
    return ruleValue !== undefined ? ruleValue : tool.value;
  };

  if (!tool.enabled) {
    return {
      key,
      enabled: false,
      reason: 'kill_switch',
      value: served(false),
      valueType,
      config,
      fallback,
    };
  }
  for (const rule of tool.targetingRules) {
    if (matchesRule(rule, snapshot, context)) {
      return {
        key,
        enabled: rule.enabled,
        reason: 'targeting',
        value: served(rule.enabled, rule.value),
        valueType,
        config,
        fallback,
      };
    }
  }
  if (tool.rolloutPercent !== null) {
    /*
     * A percentage rollout of a *value*: the bucketed-in share gets the flag's
     * value, everyone else gets the fallback. That is the honest generalisation
     * of the boolean behaviour, and it leaves the frozen bucketing math alone.
     *
     * A true multivariate split (N values across N buckets) is deliberately not
     * modelled here - it needs per-variation weights on the definition, not a
     * single percent. `stableBucket` is already keyed (flagKey, userKey), so it
     * is the natural v2 and nothing below has to change to get there.
     */
    const enabled = stableBucket(key, context.key) < tool.rolloutPercent;
    return { key, enabled, reason: 'rollout', value: served(enabled), valueType, config, fallback };
  }
  return {
    key,
    enabled: true,
    reason: 'default',
    value: served(true),
    valueType,
    config,
    fallback,
  };
}

/** Evaluate one tool. Unknown keys evaluate disabled with reason `not_found` (never throws). */
export function evaluateTool(
  snapshot: RulesetSnapshot,
  toolKey: string,
  context: UserContext,
): ToolEvaluation {
  const tool = snapshot.tools[toolKey];
  if (!tool) {
    return {
      key: toolKey,
      enabled: false,
      reason: 'not_found',
      // An unknown key has no type, so it reports the safest one: a caller
      // asking for a string gets null and falls back to its own default,
      // rather than being handed `false` typed as a string.
      value: null,
      valueType: 'boolean',
      config: null,
      fallback: null,
    };
  }
  return evaluate(toolKey, tool, snapshot, context);
}

/** Evaluate every tool in the snapshot for one user - the edge worker's evaluated-flags payload. */
export function evaluateAll(
  snapshot: RulesetSnapshot,
  context: UserContext,
): Record<string, ToolEvaluation> {
  const result: Record<string, ToolEvaluation> = {};
  for (const [key, tool] of Object.entries(snapshot.tools)) {
    result[key] = evaluate(key, tool, snapshot, context);
  }
  return result;
}
