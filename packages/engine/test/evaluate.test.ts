import { describe, expect, it } from 'vitest';

import { evaluateAll, evaluateTool, matchesSegment } from '../src/evaluate';
import {
  SCHEMA_VERSION,
  UNSUPPORTED_SENTINEL_ATTRIBUTE,
  parseRulesetSnapshot,
  type UserContext,
} from '../src/schema';

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

describe('matchesSegment', () => {
  const EU_PRO = [
    { attribute: 'plan', operator: 'in' as const, values: ['pro', 'team'] },
    { attribute: 'region', operator: 'eq' as const, value: 'eu' },
  ];
  const US_TRIAL = [
    { attribute: 'plan', operator: 'eq' as const, value: 'trial' },
    { attribute: 'country', operator: 'eq' as const, value: 'us' },
  ];

  /** Parse through the snapshot schema so defaults are applied as in production. */
  const segment = (raw: unknown) =>
    parseRulesetSnapshot({ ...base, segments: { s: raw } }).segments.s!;

  it('ANDs a flat conditions list when ruleSets is empty', () => {
    const s = segment({ conditions: EU_PRO });
    expect(matchesSegment(s, { plan: 'pro', region: 'eu' })).toBe(true);
    expect(matchesSegment(s, { plan: 'pro', region: 'us' })).toBe(false);
    expect(matchesSegment(s, { plan: 'free', region: 'eu' })).toBe(false);
  });

  it('matches everyone when a flat conditions list is empty', () => {
    expect(matchesSegment(segment({ conditions: [] }), {})).toBe(true);
  });

  it('ORs the rule sets under match:any', () => {
    const s = segment({
      conditions: [],
      match: 'any',
      ruleSets: [{ conditions: EU_PRO }, { conditions: US_TRIAL }],
    });
    expect(matchesSegment(s, { plan: 'team', region: 'eu' })).toBe(true);
    expect(matchesSegment(s, { plan: 'trial', country: 'us' })).toBe(true);
    // Neither group satisfied in full: a half-match of each is not a match.
    expect(matchesSegment(s, { plan: 'trial', region: 'eu' })).toBe(false);
    expect(matchesSegment(s, {})).toBe(false);
  });

  it('ANDs the rule sets under match:all', () => {
    const s = segment({
      conditions: [],
      match: 'all',
      ruleSets: [{ conditions: [EU_PRO[0]!] }, { conditions: [EU_PRO[1]!] }],
    });
    expect(matchesSegment(s, { plan: 'pro', region: 'eu' })).toBe(true);
    expect(matchesSegment(s, { plan: 'pro' })).toBe(false);
  });

  it('ignores conditions entirely when ruleSets is present', () => {
    /*
     * The sentinel case, and the reason this evaluator must not consult both:
     * a multi-set segment carries a never-matching condition in `conditions` for
     * readers that predate ruleSets. Honouring it here would mean no multi-set
     * segment ever matched anybody.
     */
    const s = segment({
      conditions: [{ attribute: UNSUPPORTED_SENTINEL_ATTRIBUTE, operator: 'exists' }],
      match: 'any',
      ruleSets: [{ conditions: EU_PRO }],
    });
    expect(matchesSegment(s, { plan: 'pro', region: 'eu' })).toBe(true);
  });

  it('leaves the sentinel unmatched for any real context', () => {
    // Fail-closed is the whole point: an un-upgraded reader sees only this.
    const s = segment({
      conditions: [{ attribute: UNSUPPORTED_SENTINEL_ATTRIBUTE, operator: 'exists' }],
    });
    expect(matchesSegment(s, { plan: 'pro', region: 'eu' })).toBe(false);
    expect(matchesSegment(s, {})).toBe(false);
  });

  it('gates a targeting rule through an OR segment end to end', () => {
    const snapshot = parseRulesetSnapshot({
      ...base,
      segments: {
        reach: {
          conditions: [{ attribute: UNSUPPORTED_SENTINEL_ATTRIBUTE, operator: 'exists' }],
          match: 'any',
          ruleSets: [{ conditions: EU_PRO }, { conditions: US_TRIAL }],
        },
      },
      tools: {
        'tool.x': {
          enabled: true,
          rolloutPercent: 0,
          targetingRules: [{ segments: ['reach'], enabled: true }],
        },
      },
    });
    expect(evaluateTool(snapshot, 'tool.x', user({ plan: 'pro', region: 'eu' })).reason).toBe(
      'targeting',
    );
    expect(evaluateTool(snapshot, 'tool.x', user({ plan: 'trial', country: 'us' })).reason).toBe(
      'targeting',
    );
    expect(evaluateTool(snapshot, 'tool.x', user({ plan: 'free' })).reason).toBe('rollout');
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
