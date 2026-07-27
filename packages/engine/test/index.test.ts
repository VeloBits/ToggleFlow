import { describe, expect, it } from 'vitest';

import * as engine from '../src/index';

describe('public surface', () => {
  it('freezes the schema version at 1', () => {
    expect(engine.SCHEMA_VERSION).toBe(1);
  });

  it('exports the evaluators, parser, and bucketing hash', () => {
    expect(typeof engine.evaluateTool).toBe('function');
    expect(typeof engine.evaluateAll).toBe('function');
    expect(typeof engine.parseRulesetSnapshot).toBe('function');
    expect(typeof engine.stableBucket).toBe('function');
    expect(typeof engine.fnv1a32).toBe('function');
  });

  it('exports the frozen zod schemas', () => {
    for (const schema of [
      engine.rulesetSnapshotSchema,
      engine.snapshotToolSchema,
      engine.targetingRuleSchema,
      engine.segmentSchema,
      engine.conditionSchema,
      engine.userContextSchema,
      engine.jsonValueSchema,
      engine.jsonObjectSchema,
      engine.attributeValueSchema,
    ]) {
      expect(schema).toBeDefined();
      expect(typeof schema.safeParse).toBe('function');
    }
  });
});
