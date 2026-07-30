/**
 * Deterministic % bucketing. Pure TS on purpose: this package runs in Node,
 * browsers, and Workers, so no node:crypto / WebCrypto (also enforced by
 * `types: []`).
 *
 * The hash and bucketing math are PART OF THE FROZEN v1 CONTRACT - every
 * evaluator (SDK, edge worker) must bucket a given flagKey+userKey
 * identically, or users flicker in and out of rollouts depending on where
 * the flag is checked.
 */

/** FNV-1a 32-bit over UTF-16 code units. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const BUCKET_GRANULARITY = 10_000;

/**
 * Stable bucket for a user on a flag, in [0, 100) with 0.01 granularity.
 * A user is inside a rollout when `stableBucket(flagKey, userKey) < percent`,
 * so 0% includes nobody and 100% includes everyone.
 */
export function stableBucket(flagKey: string, userKey: string): number {
  const hash = fnv1a32(`${flagKey}:${userKey}`);
  return (hash % BUCKET_GRANULARITY) / (BUCKET_GRANULARITY / 100);
}
