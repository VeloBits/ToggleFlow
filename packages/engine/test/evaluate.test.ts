import { describe, expect, it } from 'vitest';

import { evaluateAll, evaluateTool } from '../src/evaluate';
import { SCHEMA_VERSION, parseRulesetSnapshot, type UserContext } from '../src/schema';

const base = {
  schemaVersion: SCHEMA_VERSION,
  projectId: 'proj-1',
  environmentId: 'env-1',
  environmentKey: 'prod',
  version: 1,
  publishedAt: '2026-07-27T12:00:00.000Z',
};

const user = (attributes: UserContext['attributes'] = {}, key = 'user-1'): UserContext => ({
  key,
  attributes,
});

describe('evaluateAll', () => {
  it('returns an empty record for an empty snapshot', () => {
    expect(evaluateAll(parseRulesetSnapshot(base), user())).toEqual({});
  });

  it('returns one evaluation per tool, keyed and tagged with the tool key', () => {
    const snapshot = parseRulesetSnapshot({
      ...base,
      tools: { 'tool.a': { enabled: true }, 'tool.b': { enabled: false } },
    });
    const result = evaluateAll(snapshot, user());
    expect(Object.keys(result).sort()).toEqual(['tool.a', 'tool.b']);
    expect(result['tool.a']).toMatchObject({ key: 'tool.a', enabled: true, reason: 'default' });
    expect(result['tool.b']).toMatchObject({
      key: 'tool.b',
      enabled: false,
      reason: 'kill_switch',
    });
  });
});

describe('condition semantics', () => {
  const withRule = (conditions: unknown[]) =>
    parseRulesetSnapshot({
      ...base,
      tools: {
        'tool.x': {
          enabled: true,
          rolloutPercent: 0,
          targetingRules: [{ conditions, enabled: true }],
        },
      },
    });

  it('exists matches only when the attribute is present', () => {
    const snapshot = withRule([{ attribute: 'beta', operator: 'exists' }]);
    expect(evaluateTool(snapshot, 'tool.x', user({ beta: false })).reason).toBe('targeting');
    expect(evaluateTool(snapshot, 'tool.x', user({})).reason).toBe('rollout');
  });

  it('eq matches boolean attributes strictly', () => {
    const snapshot = withRule([{ attribute: 'beta', operator: 'eq', value: true }]);
    expect(evaluateTool(snapshot, 'tool.x', user({ beta: true })).enabled).toBe(true);
    expect(evaluateTool(snapshot, 'tool.x', user({ beta: 'true' })).enabled).toBe(false);
  });

  it('notIn does not match when the attribute is missing', () => {
    const snapshot = withRule([{ attribute: 'region', operator: 'notIn', values: ['eu'] }]);
    expect(evaluateTool(snapshot, 'tool.x', user({})).reason).toBe('rollout');
    expect(evaluateTool(snapshot, 'tool.x', user({ region: 'us' })).reason).toBe('targeting');
  });

  it('requires both inline conditions and segment membership when a rule has both', () => {
    const snapshot = parseRulesetSnapshot({
      ...base,
      segments: {
        beta: { conditions: [{ attribute: 'plan', operator: 'eq', value: 'pro' }] },
      },
      tools: {
        'tool.x': {
          enabled: true,
          rolloutPercent: 0,
          targetingRules: [
            {
              segments: ['beta'],
              conditions: [{ attribute: 'region', operator: 'eq', value: 'us' }],
              enabled: true,
            },
          ],
        },
      },
    });
    expect(evaluateTool(snapshot, 'tool.x', user({ plan: 'pro', region: 'us' })).reason).toBe(
      'targeting',
    );
    expect(evaluateTool(snapshot, 'tool.x', user({ region: 'us' })).reason).toBe('rollout');
    expect(evaluateTool(snapshot, 'tool.x', user({ plan: 'pro' })).reason).toBe('rollout');
  });
});

describe('rollout boundary', () => {
  // stableBucket('tool.tone-rewrite', 'user-2') is pinned at 18.60.
  const withPercent = (rolloutPercent: number) =>
    parseRulesetSnapshot({
      ...base,
      tools: { 'tool.tone-rewrite': { enabled: true, rolloutPercent } },
    });

  it('inclusion is strict less-than: bucket 18.60 is outside 18% and inside 19%', () => {
    expect(evaluateTool(withPercent(18), 'tool.tone-rewrite', user({}, 'user-2')).enabled).toBe(
      false,
    );
    expect(evaluateTool(withPercent(19), 'tool.tone-rewrite', user({}, 'user-2')).enabled).toBe(
      true,
    );
  });
});
