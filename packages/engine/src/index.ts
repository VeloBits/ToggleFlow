/**
 * @toggleflow/engine — the shared flag/config evaluation engine.
 *
 * Written once, run in three places: the control-plane API (snapshot
 * builder), the JS SDK (Node + browser), and the Cloudflare edge worker.
 * Keep this package runtime-agnostic: no Node, DOM, or Workers APIs.
 *
 * The v1 ruleset-snapshot schema and the bucketing hash exported here are
 * FROZEN — wire-format changes require a schemaVersion bump.
 */
export {
  SCHEMA_VERSION,
  attributeValueSchema,
  conditionSchema,
  jsonObjectSchema,
  jsonValueSchema,
  parseRulesetSnapshot,
  rulesetSnapshotSchema,
  segmentSchema,
  snapshotToolSchema,
  targetingRuleSchema,
  userContextSchema,
} from './schema';
export type {
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

export { evaluateAll, evaluateTool } from './evaluate';
export type { EvaluationReason, ToolEvaluation } from './evaluate';

export { fnv1a32, stableBucket } from './hash';
