/**
 * Snapshot builder: environment state → the FROZEN engine ruleset format
 * (@toggleflow/engine schemaVersion 1). Build to the contract, never modify it.
 *
 * The content hash (the delivery plane's ETag) covers everything EXCEPT
 * `version`/`publishedAt`, so republishing identical content never changes
 * the ETag and no-op mutations can be deduped before creating a version.
 */
import { createHash } from 'node:crypto';

import {
  SCHEMA_VERSION,
  UNSUPPORTED_SENTINEL_ATTRIBUTE,
  type Condition,
  type FlagValueType,
  type JsonValue,
  type SegmentMatch,
} from '@toggleflow/engine';
import { eq, and } from 'drizzle-orm';

import type { Db } from '../db';
import { environments, flagStates, projects, segments, toolConfigs, tools } from '../db/schema';

export interface SnapshotContent {
  schemaVersion: typeof SCHEMA_VERSION;
  projectId: string;
  environmentId: string;
  environmentKey: string;
  segments: Record<
    string,
    {
      conditions: unknown[];
      /** Omitted unless the segment is a real OR - see `buildSegmentEntry`. */
      match?: SegmentMatch;
      /** Omitted unless the segment is a real OR - see `buildSegmentEntry`. */
      ruleSets?: { conditions: Condition[] }[];
    }
  >;
  tools: Record<
    string,
    {
      enabled: boolean;
      rolloutPercent: number | null;
      targetingRules: unknown[];
      config: Record<string, unknown> | null;
      /** Omitted for `boolean` - see the omit-when-default rule in the builder. */
      valueType?: FlagValueType;
      /** Omitted for `boolean`, whose served value IS `enabled`. */
      value?: JsonValue;
    }
  >;
}

/**
 * DB shape (`Condition[][]` + `match`) → the engine's segment wire shape.
 *
 * ## The single-group case writes `conditions` and NOTHING else
 *
 * This is the segment twin of the omit-when-default rule on tools below, and it
 * is load-bearing for the same reason: `segmentSchema` defaults `match` to 'all'
 * and `ruleSets` to `[]`, so omitting them means exactly what writing them would,
 * while `stableStringify` drops undefined. A project whose segments are all
 * single-group therefore hashes BYTE-IDENTICALLY to what it did before OR groups
 * existed - no hash churn, no republish of a ruleset whose meaning did not
 * change, no fleet-wide edge-cache invalidation for a migration.
 *
 * With one group, `match` cannot matter: `[g].every(f)` and `[g].some(f)` are
 * both `f(g)`. So collapsing to a bare `conditions` loses nothing, which is what
 * makes the omission safe rather than merely cheap.
 *
 * ## `match: 'all'` FLATTENS, however many groups there are
 *
 * AND is associative, so "every group matches, and every condition in each group
 * matches" is the same predicate as "every condition matches". Concatenating is
 * therefore lossless, and it keeps the whole `match: 'all'` family on the old
 * wire shape: no new fields, no sentinel, no hash churn, and any evaluator ever
 * written reads it correctly. Only a genuine OR needs the new format.
 *
 * The grouping itself is not lost - it lives in the `segments` row, which is what
 * the dashboard reads. A snapshot is a derived read model for evaluation, and
 * evaluation cannot tell the two apart.
 *
 * ## `match: 'any'` writes a fail-closed sentinel into `conditions`
 *
 * A real OR has no honest flat representation, and an evaluator that predates
 * `ruleSets` reads `conditions` alone. Left empty, `[].every()` is true and such
 * a reader hands the segment to EVERY user - the worst possible failure for a
 * targeting primitive. The sentinel names an attribute no context carries, and
 * `matchesCondition` returns false for a missing attribute under every operator,
 * so an old reader matches NOBODY instead. Current readers ignore `conditions`
 * entirely when `ruleSets` is present (see `matchesSegment`).
 */
export function buildSegmentEntry(
  rules: Condition[][],
  match: SegmentMatch,
): SnapshotContent['segments'][string] {
  /*
   * Empty groups carry no constraint and are dropped first, so a half-built
   * segment from the UI cannot widen an OR to everyone: under `any`, one empty
   * group would make `some` true for every user. Dropping them also collapses the
   * all-empty case to the historical "matches everyone" segment below.
   */
  const groups = rules.filter((group) => group.length > 0);

  if (match === 'all') return { conditions: groups.flat() };
  if (groups.length === 0) return { conditions: [] };
  if (groups.length === 1) return { conditions: groups[0]! };

  return {
    conditions: [{ attribute: UNSUPPORTED_SENTINEL_ATTRIBUTE, operator: 'exists' }],
    match,
    ruleSets: groups.map((conditions) => ({ conditions })),
  };
}

/** JSON.stringify with recursively sorted object keys - hash input must be canonical. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashContent(content: SnapshotContent): string {
  return createHash('sha256').update(stableStringify(content)).digest('hex');
}

/** Returns null when the environment no longer exists (deleted mid-debounce). */
export async function buildSnapshotContent(
  db: Db,
  environmentId: string,
): Promise<SnapshotContent | null> {
  const [env] = await db
    .select({
      environmentId: environments.id,
      environmentKey: environments.key,
      projectId: environments.projectId,
    })
    .from(environments)
    .innerJoin(projects, eq(projects.id, environments.projectId))
    .where(eq(environments.id, environmentId));
  if (!env) return null;

  const [toolRows, stateRows, configRows, segmentRows] = await Promise.all([
    db
      .select()
      .from(tools)
      .where(and(eq(tools.projectId, env.projectId), eq(tools.archived, false))),
    db.select().from(flagStates).where(eq(flagStates.environmentId, environmentId)),
    db.select().from(toolConfigs).where(eq(toolConfigs.environmentId, environmentId)),
    db.select().from(segments).where(eq(segments.projectId, env.projectId)),
  ]);

  const stateByTool = new Map(stateRows.map((s) => [s.toolId, s]));
  const configByTool = new Map(configRows.map((c) => [c.toolId, c]));

  const toolEntries: SnapshotContent['tools'] = {};
  for (const tool of toolRows) {
    const state = stateByTool.get(tool.id);
    toolEntries[tool.key] = {
      enabled: state?.enabled ?? false,
      rolloutPercent: state?.rolloutPercent ?? null,
      targetingRules: state?.targetingRules ?? [],
      config: configByTool.get(tool.id)?.value ?? null,
      /*
       * OMIT-WHEN-DEFAULT, and this is load-bearing rather than tidiness.
       *
       * `snapshotToolSchema` defaults `valueType` to 'boolean' and `value` to
       * null, so leaving them out means exactly what writing them would - and
       * `stableStringify` drops undefined (see above). The consequence: for an
       * all-boolean environment the HASH INPUT serialises BYTE-IDENTICALLY to
       * what it did before typed flags existed, so its content hash is unchanged
       * and no new `ruleset_versions` row appears. (The published payload does
       * materialise the defaults, because publish.ts persists the parsed
       * snapshot - but the hash is taken from this object, before that.)
       *
       * Write them explicitly instead and every hash in the fleet changes, so
       * the first mutation in each environment - or the first republish -
       * publishes a new version of a ruleset whose meaning did not change,
       * invalidating every edge cache at once. `publish.test.ts` pins this with
       * a double-publish of an all-boolean environment expecting skipped: true.
       */
      valueType: tool.valueType === 'boolean' ? undefined : tool.valueType,
      value: tool.valueType === 'boolean' ? undefined : (state?.value ?? tool.defaultValue ?? null),
    };
  }

  const segmentEntries: SnapshotContent['segments'] = {};
  for (const segment of segmentRows) {
    segmentEntries[segment.key] = buildSegmentEntry(segment.rules, segment.match);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: env.projectId,
    environmentId: env.environmentId,
    environmentKey: env.environmentKey,
    segments: segmentEntries,
    tools: toolEntries,
  };
}
