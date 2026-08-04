import { describe, expect, it } from 'vitest';

import {
  SCHEMA_VERSION,
  parseRulesetSnapshot,
  rulesetSnapshotSchema,
  userContextSchema,
} from '../src/schema';

const minimalSnapshot = {
  schemaVersion: SCHEMA_VERSION,
  projectId: 'proj-1',
  environmentId: 'env-1',
  environmentKey: 'prod',
  version: 1,
  publishedAt: '2026-07-27T12:00:00.000Z',
};

describe('rulesetSnapshotSchema', () => {
  it('parses a minimal snapshot and applies defaults', () => {
    const parsed = parseRulesetSnapshot(minimalSnapshot);
    expect(parsed.segments).toEqual({});
    expect(parsed.tools).toEqual({});
  });

  it('applies defaults to sparse tool entries', () => {
    const parsed = parseRulesetSnapshot({
      ...minimalSnapshot,
      tools: { 'tool.sparse': { enabled: true } },
    });
    // These defaults are load-bearing, not incidental: the snapshot builder
    // omits valueType/value for boolean flags so an all-boolean environment
    // hashes identically to one written before typed values existed. If this
    // assertion ever needs relaxing, that guarantee has broken.
    expect(parsed.tools['tool.sparse']).toEqual({
      enabled: true,
      rolloutPercent: null,
      targetingRules: [],
      config: null,
      valueType: 'boolean',
      value: null,
    });
  });

  it('rejects an unknown schemaVersion', () => {
    expect(() => parseRulesetSnapshot({ ...minimalSnapshot, schemaVersion: 2 })).toThrow();
  });

  it('rejects unknown condition operators', () => {
    const snapshot = {
      ...minimalSnapshot,
      tools: {
        'tool.x': {
          enabled: true,
          targetingRules: [
            {
              enabled: false,
              conditions: [{ attribute: 'plan', operator: 'matches', value: 'pro' }],
            },
          ],
        },
      },
    };
    expect(() => parseRulesetSnapshot(snapshot)).toThrow();
  });

  it('rejects out-of-range or fractional rollout percents', () => {
    for (const rolloutPercent of [-1, 101, 12.5]) {
      expect(() =>
        parseRulesetSnapshot({
          ...minimalSnapshot,
          tools: { 'tool.x': { enabled: true, rolloutPercent } },
        }),
      ).toThrow();
    }
  });

  it('strips unknown fields instead of rejecting them (forward compatibility)', () => {
    const parsed = parseRulesetSnapshot({
      ...minimalSnapshot,
      futureField: 'ignored',
      tools: { 'tool.x': { enabled: true, futureToolField: 42 } },
    });
    expect(parsed).not.toHaveProperty('futureField');
    expect(parsed.tools['tool.x']).not.toHaveProperty('futureToolField');
  });

  it('safeParse is available for non-throwing consumers', () => {
    expect(rulesetSnapshotSchema.safeParse(null).success).toBe(false);
    expect(rulesetSnapshotSchema.safeParse(minimalSnapshot).success).toBe(true);
  });
});

describe('userContextSchema', () => {
  it('defaults attributes to an empty record', () => {
    expect(userContextSchema.parse({ key: 'user-1' }).attributes).toEqual({});
  });

  it('requires a non-empty user key', () => {
    expect(userContextSchema.safeParse({ key: '' }).success).toBe(false);
  });

  it('accepts string, number, and boolean attribute values only', () => {
    expect(
      userContextSchema.safeParse({ key: 'u', attributes: { plan: 'pro', seats: 3, beta: true } })
        .success,
    ).toBe(true);
    expect(
      userContextSchema.safeParse({ key: 'u', attributes: { nested: { plan: 'pro' } } }).success,
    ).toBe(false);
  });
});
