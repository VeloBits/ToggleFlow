/**
 * The versioned ruleset-snapshot format - THE contract between the snapshot
 * builder (API), the KV payload, the edge worker, and the SDK.
 *
 * schemaVersion 1 is FROZEN once merged: any change to the wire format
 * requires a schemaVersion bump and a new schema alongside this one.
 * Unknown object keys are stripped (zod default), so additive fields in
 * newer producers don't break older evaluators.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

// ── JSON values (config payloads) ─────────────────────────────────────────────

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonValueSchema);

// ── Targeting conditions ──────────────────────────────────────────────────────

export const attributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type AttributeValue = z.infer<typeof attributeValueSchema>;

const attribute = z.string().min(1);

/**
 * A single attribute test. `plan` and `region` are conventional attribute
 * names, not special cases. A missing attribute matches NO operator
 * (including `neq`/`notIn`) except never `exists` - rules only fire on
 * known data.
 */
export const conditionSchema = z.discriminatedUnion('operator', [
  z.object({ attribute, operator: z.literal('eq'), value: attributeValueSchema }),
  z.object({ attribute, operator: z.literal('neq'), value: attributeValueSchema }),
  z.object({ attribute, operator: z.literal('in'), values: z.array(attributeValueSchema) }),
  z.object({ attribute, operator: z.literal('notIn'), values: z.array(attributeValueSchema) }),
  z.object({ attribute, operator: z.literal('gt'), value: z.number() }),
  z.object({ attribute, operator: z.literal('gte'), value: z.number() }),
  z.object({ attribute, operator: z.literal('lt'), value: z.number() }),
  z.object({ attribute, operator: z.literal('lte'), value: z.number() }),
  z.object({ attribute, operator: z.literal('exists') }),
]);
export type Condition = z.infer<typeof conditionSchema>;

// ── Segments and targeting rules ──────────────────────────────────────────────

/** All conditions must match (AND). OR across segments happens at the rule level. */
export const segmentSchema = z.object({
  conditions: z.array(conditionSchema),
});
export type Segment = z.infer<typeof segmentSchema>;

/**
 * A rule matches when ALL `conditions` match AND, if `segments` is
 * non-empty, the user matches AT LEAST ONE listed segment. A rule with no
 * conditions and no segments matches everyone. A reference to a segment
 * key absent from the snapshot never matches. The first matching rule
 * wins and serves `enabled`.
 */
export const targetingRuleSchema = z.object({
  description: z.string().optional(),
  segments: z.array(z.string()).default([]),
  conditions: z.array(conditionSchema).default([]),
  enabled: z.boolean(),
});
export type TargetingRule = z.infer<typeof targetingRuleSchema>;

// ── Tools ─────────────────────────────────────────────────────────────────────

/**
 * Per-tool rules for one environment. `enabled: false` is the kill switch.
 * `config` is the tool's live config value; by convention its `fallback`
 * field is the payload to serve when the tool is disabled (brief §6D).
 */
export const snapshotToolSchema = z.object({
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100).nullable().default(null),
  targetingRules: z.array(targetingRuleSchema).default([]),
  config: jsonObjectSchema.nullable().default(null),
});
export type SnapshotTool = z.infer<typeof snapshotToolSchema>;

// ── The snapshot ──────────────────────────────────────────────────────────────

/** One published ruleset for one environment. `tools`/`segments` are keyed by their keys. */
export const rulesetSnapshotSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  projectId: z.string().min(1),
  environmentId: z.string().min(1),
  environmentKey: z.string().min(1),
  version: z.number().int().min(1),
  publishedAt: z.string(),
  segments: z.record(z.string(), segmentSchema).default({}),
  tools: z.record(z.string(), snapshotToolSchema).default({}),
});
export type RulesetSnapshot = z.infer<typeof rulesetSnapshotSchema>;

/** Validating parse (throws ZodError); use `rulesetSnapshotSchema.safeParse` to avoid throwing. */
export function parseRulesetSnapshot(data: unknown): RulesetSnapshot {
  return rulesetSnapshotSchema.parse(data);
}

// ── User context ──────────────────────────────────────────────────────────────

/** `key` is the stable identifier used for % bucketing. */
export const userContextSchema = z.object({
  key: z.string().min(1),
  attributes: z.record(z.string(), attributeValueSchema).default({}),
});
export type UserContext = z.infer<typeof userContextSchema>;
