/**
 * Publish hook — Phase 4 fills this with the real pipeline (build snapshot
 * from environment state → persist ruleset_versions → write to KV, debounced,
 * plus API-key hashes to KV). Until then it is a deliberate no-op so every
 * mutation route already calls the right hook at the right moment.
 */
export async function publishEnvironment(environmentId: string): Promise<void> {
  void environmentId;
}
