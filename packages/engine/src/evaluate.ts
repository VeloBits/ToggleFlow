/**
 * Flag evaluation over a parsed ruleset snapshot.
 *
 * Precedence (frozen alongside the v1 schema):
 *   kill switch  >  targeting rules (first match wins)  >  % rollout  >  default (on)
 */
import { stableBucket } from './hash';
import type {
  AttributeValue,
  Condition,
  JsonObject,
  JsonValue,
  RulesetSnapshot,
  SnapshotTool,
  TargetingRule,
  UserContext,
} from './schema';

export type EvaluationReason = 'kill_switch' | 'targeting' | 'rollout' | 'default' | 'not_found';

export interface ToolEvaluation {
  key: string;
  enabled: boolean;
  reason: EvaluationReason;
  /** The tool's live config value (null when none is set, or the tool is unknown). */
  config: JsonObject | null;
  /** `config.fallback` when present — what to serve when the tool is disabled. */
  fallback: JsonValue | null;
}

function matchesCondition(
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
    return segment.conditions.every((c) => matchesCondition(c, attributes));
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

  if (!tool.enabled) {
    return { key, enabled: false, reason: 'kill_switch', config, fallback };
  }
  for (const rule of tool.targetingRules) {
    if (matchesRule(rule, snapshot, context)) {
      return { key, enabled: rule.enabled, reason: 'targeting', config, fallback };
    }
  }
  if (tool.rolloutPercent !== null) {
    const enabled = stableBucket(key, context.key) < tool.rolloutPercent;
    return { key, enabled, reason: 'rollout', config, fallback };
  }
  return { key, enabled: true, reason: 'default', config, fallback };
}

/** Evaluate one tool. Unknown keys evaluate disabled with reason `not_found` (never throws). */
export function evaluateTool(
  snapshot: RulesetSnapshot,
  toolKey: string,
  context: UserContext,
): ToolEvaluation {
  const tool = snapshot.tools[toolKey];
  if (!tool) {
    return { key: toolKey, enabled: false, reason: 'not_found', config: null, fallback: null };
  }
  return evaluate(toolKey, tool, snapshot, context);
}

/** Evaluate every tool in the snapshot for one user — the edge worker's evaluated-flags payload. */
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
