/**
 * Snapshot builder: environment state → the FROZEN engine ruleset format
 * (@toggleflow/engine schemaVersion 1). Build to the contract, never modify it.
 *
 * The content hash (the delivery plane's ETag) covers everything EXCEPT
 * `version`/`publishedAt`, so republishing identical content never changes
 * the ETag and no-op mutations can be deduped before creating a version.
 */
import { createHash } from 'node:crypto';

import { SCHEMA_VERSION } from '@toggleflow/engine';
import { eq, and } from 'drizzle-orm';

import type { Db } from '../db';
import { environments, flagStates, projects, segments, toolConfigs, tools } from '../db/schema';

export interface SnapshotContent {
  schemaVersion: typeof SCHEMA_VERSION;
  projectId: string;
  environmentId: string;
  environmentKey: string;
  segments: Record<string, { conditions: unknown[] }>;
  tools: Record<
    string,
    {
      enabled: boolean;
      rolloutPercent: number | null;
      targetingRules: unknown[];
      config: Record<string, unknown> | null;
    }
  >;
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
    };
  }

  const segmentEntries: SnapshotContent['segments'] = {};
  for (const segment of segmentRows) {
    segmentEntries[segment.key] = { conditions: segment.rules };
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
