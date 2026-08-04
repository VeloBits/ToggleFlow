// @vitest-environment happy-dom
/**
 * `sortFlags` and `nextSort` as pure functions.
 *
 * Unit-tested directly rather than through the page for the same reason
 * `flags-filter` is: every comparator and both directions is a handful of
 * assertions here and a re-render each through the DOM.
 */
import { describe, expect, it } from 'vitest';

import { flagStatus, STATUS_ORDER } from '../src/features/flags/FlagStatusBadge';
import {
  DEFAULT_SORT,
  nextSort,
  sortFlags,
  type SortableFlag,
} from '../src/features/flags/flags-sort';

const flag = (over: Partial<SortableFlag> = {}): SortableFlag => ({
  key: 'a.flag',
  name: 'A flag',
  valueType: 'boolean',
  enabled: true,
  rolloutPercent: null,
  archived: false,
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const keys = (rows: SortableFlag[]) => rows.map((row) => row.key);

describe('flagStatus', () => {
  it('reports the four states, archived winning over the rest', () => {
    expect(flagStatus(flag())).toBe('on');
    expect(flagStatus(flag({ enabled: false }))).toBe('off');
    expect(flagStatus(flag({ rolloutPercent: 25 }))).toBe('rollout');
    // Archived is not a live state, so it is reported instead of on/off rather
    // than alongside it.
    expect(flagStatus(flag({ archived: true, enabled: false }))).toBe('archived');
    expect(flagStatus(flag({ archived: true, rolloutPercent: 10 }))).toBe('archived');
  });
});

describe('STATUS_ORDER', () => {
  it('puts off first and archived last', () => {
    // Deliberate: sorting by status is what someone does during an incident, and
    // the thing they are looking for is what is switched off.
    expect(STATUS_ORDER.off).toBeLessThan(STATUS_ORDER.rollout);
    expect(STATUS_ORDER.rollout).toBeLessThan(STATUS_ORDER.on);
    expect(STATUS_ORDER.on).toBeLessThan(STATUS_ORDER.archived);
  });
});

describe('sortFlags', () => {
  it('does not mutate its input', () => {
    const rows = [flag({ key: 'b' }), flag({ key: 'a' })];
    const before = keys(rows);
    sortFlags(rows, { key: 'key', dir: 'asc' });
    expect(keys(rows)).toEqual(before);
  });

  it('sorts by key, ascending and descending', () => {
    const rows = [flag({ key: 'c' }), flag({ key: 'a' }), flag({ key: 'b' })];
    expect(keys(sortFlags(rows, { key: 'key', dir: 'asc' }))).toEqual(['a', 'b', 'c']);
    expect(keys(sortFlags(rows, { key: 'key', dir: 'desc' }))).toEqual(['c', 'b', 'a']);
  });

  it('orders numbered keys the way a human reads them', () => {
    // Codepoint order puts step-10 before step-2, which is visibly wrong in a
    // list of flag keys - and flag keys are full of numbers.
    const rows = [flag({ key: 'step-10' }), flag({ key: 'step-2' })];
    expect(keys(sortFlags(rows, { key: 'key', dir: 'asc' }))).toEqual(['step-2', 'step-10']);
  });

  it('sorts accented names next to their base letter', () => {
    const rows = [flag({ key: 'z', name: 'Zulu' }), flag({ key: 'a', name: 'Ärger' })];
    expect(keys(sortFlags(rows, { key: 'name', dir: 'asc' }))).toEqual(['a', 'z']);
  });

  it('sorts by name', () => {
    const rows = [flag({ key: 'a', name: 'Beta' }), flag({ key: 'b', name: 'Alpha' })];
    expect(keys(sortFlags(rows, { key: 'name', dir: 'asc' }))).toEqual(['b', 'a']);
  });

  it('sorts by value type', () => {
    const rows = [
      flag({ key: 'c', valueType: 'string_enum' }),
      flag({ key: 'a', valueType: 'boolean' }),
      flag({ key: 'b', valueType: 'string' }),
    ];
    expect(keys(sortFlags(rows, { key: 'type', dir: 'asc' }))).toEqual(['a', 'b', 'c']);
  });

  it('sorts by status off, then rollout, then on', () => {
    const rows = [
      flag({ key: 'on' }),
      flag({ key: 'off', enabled: false }),
      flag({ key: 'part', rolloutPercent: 50 }),
    ];
    expect(keys(sortFlags(rows, { key: 'status', dir: 'asc' }))).toEqual(['off', 'part', 'on']);
  });

  it('sorts by updated time, oldest first ascending', () => {
    const rows = [
      flag({ key: 'new', updatedAt: '2026-08-01T00:00:00.000Z' }),
      flag({ key: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(keys(sortFlags(rows, { key: 'updatedAt', dir: 'asc' }))).toEqual(['old', 'new']);
    expect(keys(sortFlags(rows, { key: 'updatedAt', dir: 'desc' }))).toEqual(['new', 'old']);
  });

  it('breaks ties by key, so equal rows keep a stable order', () => {
    // Without this, two flags updated in the same second (or both off) would
    // shuffle between renders and make the table look alive when nothing moved.
    const rows = [
      flag({ key: 'zebra', enabled: false }),
      flag({ key: 'apple', enabled: false }),
      flag({ key: 'mango', enabled: false }),
    ];
    expect(keys(sortFlags(rows, { key: 'status', dir: 'asc' }))).toEqual([
      'apple',
      'mango',
      'zebra',
    ]);
  });

  it('keeps the tiebreaker out of the way when sorting by key itself', () => {
    const rows = [flag({ key: 'b' }), flag({ key: 'a' })];
    expect(keys(sortFlags(rows, { key: 'key', dir: 'desc' }))).toEqual(['b', 'a']);
  });

  it('handles an empty list', () => {
    expect(sortFlags([], DEFAULT_SORT)).toEqual([]);
  });
});

describe('nextSort', () => {
  it('starts a new column ascending', () => {
    expect(nextSort({ key: 'key', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });

  it('flips direction on the column already sorted', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });
});

describe('DEFAULT_SORT', () => {
  it('matches the order the API already returns, so the first paint is not a re-sort', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'key', dir: 'asc' });
  });
});
