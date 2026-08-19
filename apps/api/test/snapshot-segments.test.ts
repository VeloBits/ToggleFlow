/**
 * `buildSegmentEntry`: the DB's `Condition[][]` + `match` → the engine's segment
 * wire shape.
 *
 * Worth its own file because the function carries the whole compatibility story
 * for OR groups, and two of its guarantees are invisible from the outside:
 * that a single-group segment serialises byte-identically to the pre-OR format
 * (so content hashes do not churn), and that a real OR leaves a fail-closed
 * sentinel for evaluators that predate `ruleSets`.
 */
import { UNSUPPORTED_SENTINEL_ATTRIBUTE, type Condition } from '@toggleflow/engine';
import { describe, expect, it } from 'vitest';

import { buildSegmentEntry, stableStringify } from '../src/lib/snapshot';

const PLAN: Condition = { attribute: 'plan', operator: 'in', values: ['pro', 'team'] };
const REGION: Condition = { attribute: 'region', operator: 'eq', value: 'eu' };
const TRIAL: Condition = { attribute: 'plan', operator: 'eq', value: 'trial' };

describe('buildSegmentEntry', () => {
  it('emits a bare conditions list for a single group', () => {
    const entry = buildSegmentEntry([[PLAN, REGION]], 'all');
    expect(entry).toEqual({ conditions: [PLAN, REGION] });
    // Not merely absent-when-serialised: the keys must not be present at all,
    // or a reader inspecting the object would see an OR segment.
    expect('match' in entry).toBe(false);
    expect('ruleSets' in entry).toBe(false);
  });

  it('serialises a single-group segment identically to the pre-OR shape', () => {
    /*
     * THE hash-churn guard. `hashContent` runs over `stableStringify`, so as long
     * as these two strings agree, every segment written before OR groups existed
     * keeps its content hash and no environment republishes a ruleset whose
     * meaning did not change. If this fails, the migration invalidates every edge
     * cache in the fleet.
     */
    expect(stableStringify(buildSegmentEntry([[PLAN]], 'all'))).toBe(
      stableStringify({ conditions: [PLAN] }),
    );
    expect(stableStringify(buildSegmentEntry([[]], 'all'))).toBe(
      stableStringify({ conditions: [] }),
    );
  });

  it('flattens multiple groups under match:all, since AND is associative', () => {
    const entry = buildSegmentEntry([[PLAN], [REGION]], 'all');
    expect(entry).toEqual({ conditions: [PLAN, REGION] });
    expect('ruleSets' in entry).toBe(false);
  });

  it('emits ruleSets plus a fail-closed sentinel for a real OR', () => {
    const entry = buildSegmentEntry([[PLAN, REGION], [TRIAL]], 'any');
    expect(entry).toEqual({
      conditions: [{ attribute: UNSUPPORTED_SENTINEL_ATTRIBUTE, operator: 'exists' }],
      match: 'any',
      ruleSets: [{ conditions: [PLAN, REGION] }, { conditions: [TRIAL] }],
    });
  });

  it('collapses a one-group match:any to the old shape', () => {
    // OR of one thing is that thing, so there is nothing an old reader would get
    // wrong and no reason to spend the new format on it.
    expect(buildSegmentEntry([[PLAN]], 'any')).toEqual({ conditions: [PLAN] });
  });

  it('drops empty groups before deciding, so a half-built OR cannot widen', () => {
    /*
     * The dangerous case: under `any`, an empty group matches everyone, so
     * `some` would be true for every user - a segment silently targeting the
     * whole world while the UI shows one real condition. Dropping empties first
     * makes this a one-group segment instead.
     */
    expect(buildSegmentEntry([[PLAN], []], 'any')).toEqual({ conditions: [PLAN] });
    expect(buildSegmentEntry([[], []], 'any')).toEqual({ conditions: [] });
  });

  it('treats an all-empty match:all as the historical match-everyone segment', () => {
    expect(buildSegmentEntry([[]], 'all')).toEqual({ conditions: [] });
    expect(buildSegmentEntry([], 'all')).toEqual({ conditions: [] });
  });
});
