/**
 * The read-only jsonb walks behind `/segments/usage` and `/attributes`.
 *
 * Heavy on malformed input on purpose: both helpers read columns typed
 * `jsonb.$type<unknown[]>()`, where the type parameter is a promise about rows
 * this process wrote rather than a guarantee about what is in the table. A bad
 * row must contribute nothing, never throw - these endpoints only count things.
 */
import { UNSUPPORTED_SENTINEL_ATTRIBUTE } from '@toggleflow/engine';
import { describe, expect, it } from 'vitest';

import {
  conditionsInRules,
  conditionsInTargetingRules,
  segmentKeysInTargetingRules,
  summarizeAttributes,
} from '../src/lib/targeting-scan';

describe('conditionsInRules', () => {
  it('flattens groups into conditions', () => {
    const rules = [
      [{ attribute: 'plan', operator: 'eq', value: 'pro' }],
      [{ attribute: 'region', operator: 'eq', value: 'eu' }],
    ];
    expect(conditionsInRules(rules).map((c) => c.attribute)).toEqual(['plan', 'region']);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['a flat pre-migration list', [{ attribute: 'plan' }]],
    ['groups holding scalars', [['plan'], [3]]],
  ])('contributes nothing for %s', (_label, input) => {
    expect(conditionsInRules(input)).toEqual([]);
  });
});

describe('segmentKeysInTargetingRules', () => {
  it('collects segment keys across rules', () => {
    const rules = [{ segments: ['beta', 'eu'] }, { segments: ['beta'] }, { conditions: [] }];
    expect(segmentKeysInTargetingRules(rules)).toEqual(['beta', 'eu', 'beta']);
  });

  it.each([
    ['null', null],
    ['an object', { segments: ['beta'] }],
    ['rules without segments', [{ enabled: true }]],
    ['a non-array segments field', [{ segments: 'beta' }]],
  ])('contributes nothing for %s', (_label, input) => {
    expect(segmentKeysInTargetingRules(input)).toEqual([]);
  });

  it('skips non-string entries inside segments', () => {
    expect(segmentKeysInTargetingRules([{ segments: ['beta', 7, null] }])).toEqual(['beta']);
  });
});

describe('conditionsInTargetingRules', () => {
  it('collects inline conditions across rules', () => {
    const rules = [
      { conditions: [{ attribute: 'plan', operator: 'eq', value: 'pro' }] },
      { segments: ['beta'] },
    ];
    expect(conditionsInTargetingRules(rules).map((c) => c.attribute)).toEqual(['plan']);
  });
});

describe('summarizeAttributes', () => {
  it('counts usage and gathers value samples', () => {
    const summary = summarizeAttributes([
      { attribute: 'plan', operator: 'in', values: ['pro', 'team'] },
      { attribute: 'plan', operator: 'eq', value: 'trial' },
      { attribute: 'seats', operator: 'gte', value: 5 },
    ]);
    expect(summary).toEqual([
      { name: 'plan', usageCount: 2, valueSamples: ['pro', 'team', 'trial'] },
      { name: 'seats', usageCount: 1, valueSamples: [5] },
    ]);
  });

  it('orders by usage, then name, so the dropdown is stable', () => {
    const summary = summarizeAttributes([
      { attribute: 'zeta', operator: 'exists' },
      { attribute: 'alpha', operator: 'exists' },
      { attribute: 'used', operator: 'exists' },
      { attribute: 'used', operator: 'exists' },
    ]);
    expect(summary.map((a) => a.name)).toEqual(['used', 'alpha', 'zeta']);
  });

  it('yields no samples for exists, which compares against nothing', () => {
    expect(summarizeAttributes([{ attribute: 'plan', operator: 'exists' }])).toEqual([
      { name: 'plan', usageCount: 1, valueSamples: [] },
    ]);
  });

  it('never suggests the sentinel attribute', () => {
    // It lives in snapshots rather than in `segments.rules`, so it should not
    // reach here at all - but suggesting the one attribute guaranteed to match
    // nobody would be a uniquely unhelpful bug.
    const summary = summarizeAttributes([
      { attribute: UNSUPPORTED_SENTINEL_ATTRIBUTE, operator: 'exists' },
      { attribute: 'plan', operator: 'exists' },
    ]);
    expect(summary.map((a) => a.name)).toEqual(['plan']);
  });

  it('skips conditions with no usable attribute name', () => {
    expect(
      summarizeAttributes([{ operator: 'exists' }, { attribute: '' }, { attribute: 9 }]),
    ).toEqual([]);
  });

  it('keeps only scalar literals', () => {
    const [entry] = summarizeAttributes([
      { attribute: 'x', operator: 'in', values: ['a', 2, true, { nested: 1 }, ['deep'], null] },
    ]);
    expect(entry!.valueSamples).toEqual([2, 'a', true]);
  });

  it('caps the sample list', () => {
    const values = Array.from({ length: 60 }, (_, i) => `v${i}`);
    const [entry] = summarizeAttributes([{ attribute: 'x', operator: 'in', values }]);
    expect(entry!.valueSamples).toHaveLength(25);
  });
});
