import { conditionSchema, segmentMatchSchema } from '@toggleflow/engine';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveProject, resolveSegment } from '../auth/rbac';
import { environments, flagStates, segments, tools } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { notFound } from '../lib/errors';
import {
  conditionsInRules,
  conditionsInTargetingRules,
  segmentKeysInTargetingRules,
  summarizeAttributes,
} from '../lib/targeting-scan';

/** One flag, in one environment, whose targeting rules name a segment. */
interface SegmentReference {
  flagId: string;
  flagKey: string;
  flagName: string;
  environmentId: string;
  environmentKey: string;
  environmentName: string;
}

interface SegmentUsage {
  /** Distinct flag-state rows referencing the segment - the delete-guard number. */
  flagCount: number;
  references: SegmentReference[];
}

const projectParams = z.object({ projectId: z.uuid() });
const segmentParams = z.object({ segmentId: z.uuid() });

const segmentKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase letters, digits, dots, dashes, underscores only');

/**
 * A list of AND-groups, combined by the segment's `match`.
 *
 * At least one group, because the column's invariant is "always a group" and a
 * bare `[]` would otherwise mean two different things depending on `match`
 * (`every` of nothing is true, `some` of nothing is false). One empty group is
 * the legal way to say "no conditions yet", and still matches everyone.
 *
 * The 100-condition ceiling is per group rather than per segment, and the group
 * count is capped too, so the worst case stays bounded at 20x100 - a ruleset is
 * fetched on every cold SDK start and shipped to every edge PoP.
 */
const segmentRules = z.array(z.array(conditionSchema).max(100)).min(1).max(20);

const segmentCreateBody = z.object({
  key: segmentKey,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  rules: segmentRules.default([[]]),
  match: segmentMatchSchema.default('all'),
});

const segmentPatchBody = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    rules: segmentRules,
    match: segmentMatchSchema,
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, 'at least one field required');

async function publishProjectEnvironments(app: FastifyInstance, projectId: string) {
  const rows = await app.db
    .select({ id: environments.id })
    .from(environments)
    .where(eq(environments.projectId, projectId));
  for (const row of rows) app.publisher.scheduleRuleset(row.id);
}

export function registerSegmentRoutes(app: FastifyInstance): void {
  app.get('/v1/projects/:projectId/segments', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await resolveProject(app.db, req.auth, projectId, 'viewer');
    return app.db
      .select()
      .from(segments)
      .where(eq(segments.projectId, projectId))
      .orderBy(asc(segments.key));
  });

  /*
   * Which flags reference which segment, across every environment of the project.
   *
   * Whole-project rather than per-segment on purpose: the list page needs a count
   * for every row and the detail page needs the references for one, so a single
   * cacheable response serves both and the list does not fan out N requests.
   *
   * Keyed by segment KEY, not id, because that is what a targeting rule stores -
   * a rule can also name a segment that does not exist (the engine treats it as
   * never matching), and those keys are reported too so the UI can surface a
   * dangling reference rather than silently dropping it.
   */
  app.get('/v1/projects/:projectId/segments/usage', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await resolveProject(app.db, req.auth, projectId, 'viewer');

    const rows = await app.db
      .select({
        environmentId: environments.id,
        environmentKey: environments.key,
        environmentName: environments.name,
        flagId: tools.id,
        flagKey: tools.key,
        flagName: tools.name,
        targetingRules: flagStates.targetingRules,
      })
      .from(flagStates)
      .innerJoin(environments, eq(flagStates.environmentId, environments.id))
      .innerJoin(tools, eq(flagStates.toolId, tools.id))
      .where(eq(environments.projectId, projectId));

    const usage: Record<string, SegmentUsage> = {};
    for (const row of rows) {
      // Deduped per flag-state row: a flag whose rules name the same segment in
      // two rules is one flag using it once, as far as "is this in use" goes.
      for (const key of new Set(segmentKeysInTargetingRules(row.targetingRules))) {
        const entry = (usage[key] ??= { flagCount: 0, references: [] });
        entry.flagCount += 1;
        entry.references.push({
          flagId: row.flagId,
          flagKey: row.flagKey,
          flagName: row.flagName,
          environmentId: row.environmentId,
          environmentKey: row.environmentKey,
          environmentName: row.environmentName,
        });
      }
    }
    return usage;
  });

  /**
   * The attribute vocabulary this project actually targets on, with the literals
   * each attribute has been compared against.
   *
   * There is no attribute registry - `condition.attribute` is a free-form string
   * the SDK matches against whatever the caller passes - so the honest source for
   * a suggestion list is what the project already says. Derived here rather than
   * in the dashboard because the flag half of the answer would otherwise cost the
   * client a full flags payload per environment purely to harvest strings.
   *
   * Suggestions only: the UI must still accept a typed attribute, or a project
   * targeting on something it has never used before could not start.
   */
  app.get('/v1/projects/:projectId/attributes', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await resolveProject(app.db, req.auth, projectId, 'viewer');

    const [segmentRows, stateRows] = await Promise.all([
      app.db
        .select({ rules: segments.rules })
        .from(segments)
        .where(eq(segments.projectId, projectId)),
      app.db
        .select({ targetingRules: flagStates.targetingRules })
        .from(flagStates)
        .innerJoin(environments, eq(flagStates.environmentId, environments.id))
        .where(eq(environments.projectId, projectId)),
    ]);

    return summarizeAttributes([
      ...segmentRows.flatMap((row) => conditionsInRules(row.rules)),
      ...stateRows.flatMap((row) => conditionsInTargetingRules(row.targetingRules)),
    ]);
  });

  app.post('/v1/projects/:projectId/segments', async (req, reply) => {
    const { projectId } = projectParams.parse(req.params);
    const body = segmentCreateBody.parse(req.body);
    const scope = await resolveProject(app.db, req.auth, projectId, 'developer');

    const segment = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(segments)
        .values({
          projectId,
          key: body.key,
          name: body.name,
          description: body.description ?? null,
          rules: body.rules,
          match: body.match,
        })
        .returning();
      if (!row) throw new Error('segment insert failed');
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'segment.create',
        entityType: 'segment',
        entityId: row.id,
        after: { key: row.key, name: row.name, rules: row.rules, match: row.match },
      });
      return row;
    });
    await publishProjectEnvironments(app, projectId);
    return reply.status(201).send(segment);
  });

  app.patch('/v1/segments/:segmentId', async (req) => {
    const { segmentId } = segmentParams.parse(req.params);
    const body = segmentPatchBody.parse(req.body);
    const scope = await resolveSegment(app.db, req.auth, segmentId, 'developer');

    const segment = await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(segments).where(eq(segments.id, segmentId));
      if (!before) throw notFound('segment');
      const [after] = await tx
        .update(segments)
        .set(body)
        .where(eq(segments.id, segmentId))
        .returning();
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'segment.update',
        entityType: 'segment',
        entityId: segmentId,
        before: {
          name: before.name,
          description: before.description,
          rules: before.rules,
          match: before.match,
        },
        after: body,
      });
      return after;
    });
    await publishProjectEnvironments(app, scope.projectId);
    return segment;
  });

  app.delete('/v1/segments/:segmentId', async (req, reply) => {
    const { segmentId } = segmentParams.parse(req.params);
    const scope = await resolveSegment(app.db, req.auth, segmentId, 'developer');

    await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(segments).where(eq(segments.id, segmentId));
      if (!before) throw notFound('segment');
      await tx.delete(segments).where(eq(segments.id, segmentId));
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'segment.delete',
        entityType: 'segment',
        entityId: segmentId,
        before: { key: before.key, name: before.name },
      });
    });
    await publishProjectEnvironments(app, scope.projectId);
    return reply.status(204).send();
  });
}
