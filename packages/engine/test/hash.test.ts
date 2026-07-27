/**
 * The hash and bucketing math are part of the frozen v1 contract: the pinned
 * values below must NEVER change. If one of these tests fails, the change
 * breaks rollout consistency for every deployed evaluator — bump the
 * schemaVersion instead of touching the hash.
 */
import { describe, expect, it } from 'vitest';

import { fnv1a32, stableBucket } from '../src/hash';

describe('fnv1a32', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
});

describe('stableBucket', () => {
  it('is deterministic and matches the pinned golden buckets', () => {
    expect(stableBucket('tool.tone-rewrite', 'user-1')).toBe(47.17);
    expect(stableBucket('tool.tone-rewrite', 'user-2')).toBe(18.6);
    expect(stableBucket('tool.tone-rewrite', 'alice')).toBe(12.04);
    expect(stableBucket('tool.tone-rewrite', 'bob')).toBe(36.47);
  });

  it('depends on the flag key, not just the user key', () => {
    expect(stableBucket('tool.a', 'user-1')).not.toBe(stableBucket('tool.b', 'user-1'));
  });

  it('stays in [0, 100) for many keys', () => {
    for (let i = 0; i < 5000; i++) {
      const bucket = stableBucket('tool.range', `user-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('distributes ~uniformly (pinned: 263 of 1000 users inside a 25% rollout)', () => {
    let inside = 0;
    for (let i = 0; i < 1000; i++) {
      if (stableBucket('tool.tone-rewrite', `dist-user-${i}`) < 25) inside++;
    }
    expect(inside).toBe(263);
  });
});
