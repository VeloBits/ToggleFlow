/**
 * Copying one environment's configuration into another.
 *
 * A new environment normally starts empty, which for a project with hundreds of
 * flags means hundreds of manual edits before Staging resembles Production.
 * Inheritance takes a **point-in-time snapshot**: rows are copied once, at
 * creation, and the two environments are independent from that moment on. There
 * is deliberately no live link - a flag flipped in Production must never move
 * anything in Staging, because that is the "edited the wrong environment"
 * failure this product exists to prevent.
 *
 * ## Adding a resource
 *
 * Everything inheritable is an entry in `INHERITABLE_RESOURCES`. To make a new
 * per-environment resource participate, append one entry with a `copy` that
 * does its own set-based insert and returns how many rows it wrote - the route,
 * the audit entry, the API response and the dashboard's summary all read the
 * registry, so none of them need touching.
 *
 * ## What is deliberately NOT here
 *
 * - **API keys** - credentials. A new environment gets its own; copying a key
 *   hash would mean two environments answering to one secret.
 * - **Ruleset versions** - the delivery plane's published history. The new
 *   environment publishes its own v1 from the state it just inherited, so its
 *   version numbers describe its own life rather than claiming a past it did
 *   not have.
 * - **Config version history** - same reasoning, one level down: the inherited
 *   value lands as version 1 rather than replaying the source's v1..v9.
 * - **Segments** - already project-scoped and shared by every environment in
 *   the project (see db/schema.ts), so targeting rules that reference them keep
 *   resolving with nothing copied at all.
 */
import { sql } from 'drizzle-orm';

import { configVersions } from '../db/schema';

/**
 * Anything with drizzle's `insert`/`execute` - a Db or a transaction. Typed
 * structurally so callers are not forced to thread drizzle's transaction
 * generics through every signature.
 */
type Executor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
  insert: (table: typeof configVersions) => {
    values: (rows: (typeof configVersions.$inferInsert)[]) => Promise<unknown>;
  };
};

export interface InheritanceContext {
  tx: Executor;
  fromEnvironmentId: string;
  toEnvironmentId: string;
  /** Recorded as the author of the copied config version; null for system runs. */
  actorId: string | null;
}

export interface InheritableResource {
  /** Stable identifier - appears in the audit entry and the API response. */
  key: string;
  /** Shown in the dashboard's "what was copied" summary. Plural, lowercase. */
  label: string;
  /** Performs the copy and returns the number of rows written. */
  copy: (ctx: InheritanceContext) => Promise<number>;
}

/** postgres-js returns RETURNING rows as an array; narrow without asserting a driver type. */
function rows(result: unknown): Record<string, unknown>[] {
  return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
}

/**
 * Flag state: on/off, the served value, rollout percentage and targeting rules.
 *
 * An UPDATE rather than an INSERT because the environment-creation route has
 * already written one default row per tool to hold its (tool, environment)
 * invariant. Updating in place keeps that invariant true for tools the source
 * environment has no row for, instead of leaving them absent.
 *
 * The column list is explicit, which means a new per-environment column is
 * silently NOT inherited until it is added here - `value` was exactly that case.
 * Leave one out and the new environment diverges from its source on that field
 * alone, which is the failure this module's docblock says it exists to prevent.
 */
const flagStates: InheritableResource = {
  key: 'flagStates',
  label: 'flag states',
  copy: async ({ tx, fromEnvironmentId, toEnvironmentId }) => {
    const result = await tx.execute(sql`
      update flag_states as target
      set enabled = source.enabled,
          value = source.value,
          rollout_percent = source.rollout_percent,
          targeting_rules = source.targeting_rules,
          updated_at = now()
      from flag_states as source
      where source.environment_id = ${fromEnvironmentId}::uuid
        and target.environment_id = ${toEnvironmentId}::uuid
        and target.tool_id = source.tool_id
      returning target.id
    `);
    return rows(result).length;
  },
};

/**
 * Remote config values (which is where variations, defaults and the off-state
 * fallback live - see the config contract in the product brief).
 *
 * The new rows start at version 1 with a matching `config_versions` entry, so
 * the config history page and the rollback path see the same shape they would
 * after a first manual save.
 */
const toolConfigs: InheritableResource = {
  key: 'toolConfigs',
  label: 'config values',
  copy: async ({ tx, fromEnvironmentId, toEnvironmentId, actorId }) => {
    const inserted = rows(
      await tx.execute(sql`
        insert into tool_configs (tool_id, environment_id, value, version)
        select source.tool_id, ${toEnvironmentId}::uuid, source.value, 1
        from tool_configs as source
        where source.environment_id = ${fromEnvironmentId}::uuid
        on conflict (tool_id, environment_id) do nothing
        returning id, value
      `),
    );
    if (inserted.length === 0) return 0;

    await tx.insert(configVersions).values(
      inserted.map((row) => ({
        toolConfigId: row.id as string,
        version: 1,
        value: row.value as Record<string, unknown>,
        authorId: actorId,
      })),
    );
    return inserted.length;
  },
};

export const INHERITABLE_RESOURCES: InheritableResource[] = [flagStates, toolConfigs];

export interface CopiedResource {
  key: string;
  label: string;
  count: number;
}

/**
 * Runs every registered resource. Sequential on purpose: this is inside the
 * caller's transaction, and one connection cannot interleave statements.
 */
export async function inheritEnvironment(ctx: InheritanceContext): Promise<CopiedResource[]> {
  const copied: CopiedResource[] = [];
  for (const resource of INHERITABLE_RESOURCES) {
    copied.push({
      key: resource.key,
      label: resource.label,
      count: await resource.copy(ctx),
    });
  }
  return copied;
}
