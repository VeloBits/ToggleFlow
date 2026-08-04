import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireOrgRole, resolveEnvironment, resolveProject } from '../auth/rbac';
import { environments, flagStates, projects, tools } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { badRequest, notFound } from '../lib/errors';
import { inheritEnvironment, type CopiedResource } from '../lib/environment-inheritance';

/**
 * A new project gets Production and nothing else.
 *
 * This used to seed dev/staging/prod. Two of those three were furniture: every
 * project carried a Staging its team may never deploy to, and an environment
 * with no API key and no SDK polling it is worse than absent - it dilutes the
 * env switcher, and "which environment am I editing?" is the one catastrophic
 * mistake this product exists to prevent. Production is the environment that
 * always means something, so it is the only one created for you; the rest are
 * one click away in the environment switcher.
 */
const DEFAULT_ENVIRONMENTS = [{ key: 'prod', name: 'Production' }] as const;

const orgParams = z.object({ orgId: z.uuid() });
const projectParams = z.object({ projectId: z.uuid() });
const environmentParams = z.object({ environmentId: z.uuid() });

const projectBody = z.object({ name: z.string().min(1).max(200) });
const environmentBody = z.object({
  key: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits, and dashes only'),
  name: z.string().min(1).max(200),
  /**
   * Copy this environment's configuration into the new one as a starting
   * snapshot (lib/environment-inheritance.ts). Absent or null = blank
   * environment, which stays the behaviour for any caller that predates this.
   */
  inheritFromEnvironmentId: z.uuid().nullish(),
});
const environmentPatchBody = z.object({ name: z.string().min(1).max(200) });

export function registerProjectRoutes(app: FastifyInstance): void {
  app.get('/v1/orgs/:orgId/projects', async (req) => {
    const { orgId } = orgParams.parse(req.params);
    requireOrgRole(req.auth, orgId, 'viewer');
    return app.db
      .select()
      .from(projects)
      .where(eq(projects.orgId, orgId))
      .orderBy(asc(projects.createdAt));
  });

  app.post('/v1/orgs/:orgId/projects', async (req, reply) => {
    const { orgId } = orgParams.parse(req.params);
    const body = projectBody.parse(req.body);
    requireOrgRole(req.auth, orgId, 'admin');

    const result = await app.db.transaction(async (tx) => {
      const [project] = await tx.insert(projects).values({ orgId, name: body.name }).returning();
      if (!project) throw new Error('project insert failed');
      const envRows = await tx
        .insert(environments)
        .values(DEFAULT_ENVIRONMENTS.map((e) => ({ ...e, projectId: project.id })))
        .returning();
      await writeAudit(tx, {
        orgId,
        actorId: req.auth.user.id,
        action: 'project.create',
        entityType: 'project',
        entityId: project.id,
        after: { name: project.name, environments: envRows.map((e) => e.key) },
      });
      return { ...project, environments: envRows };
    });
    return reply.status(201).send(result);
  });

  app.get('/v1/projects/:projectId', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await resolveProject(app.db, req.auth, projectId, 'viewer');
    const [project] = await app.db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw notFound('project');
    const envRows = await app.db
      .select()
      .from(environments)
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environments.createdAt));
    return { ...project, environments: envRows };
  });

  app.patch('/v1/projects/:projectId', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    const body = projectBody.parse(req.body);
    const scope = await resolveProject(app.db, req.auth, projectId, 'admin');

    return app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(projects).where(eq(projects.id, projectId));
      if (!before) throw notFound('project');
      const [after] = await tx
        .update(projects)
        .set({ name: body.name })
        .where(eq(projects.id, projectId))
        .returning();
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'project.update',
        entityType: 'project',
        entityId: projectId,
        before: { name: before.name },
        after: { name: after?.name },
      });
      return after;
    });
  });

  app.delete('/v1/projects/:projectId', async (req, reply) => {
    const { projectId } = projectParams.parse(req.params);
    const scope = await resolveProject(app.db, req.auth, projectId, 'admin');

    await app.db.transaction(async (tx) => {
      const [before] = await tx.select().from(projects).where(eq(projects.id, projectId));
      if (!before) throw notFound('project');
      await tx.delete(projects).where(eq(projects.id, projectId));
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'project.delete',
        entityType: 'project',
        entityId: projectId,
        before: { name: before.name },
      });
    });
    return reply.status(204).send();
  });

  app.get('/v1/projects/:projectId/environments', async (req) => {
    const { projectId } = projectParams.parse(req.params);
    await resolveProject(app.db, req.auth, projectId, 'viewer');
    return app.db
      .select()
      .from(environments)
      .where(eq(environments.projectId, projectId))
      .orderBy(asc(environments.createdAt));
  });

  app.post('/v1/projects/:projectId/environments', async (req, reply) => {
    const { projectId } = projectParams.parse(req.params);
    const body = environmentBody.parse(req.body);
    const scope = await resolveProject(app.db, req.auth, projectId, 'admin');

    /*
     * Resolved before the transaction opens, and constrained to this project by
     * the same query that fetches it: a caller who passes a valid environment
     * id from a project they can also see must not be able to siphon its
     * configuration in here. 400 rather than 404 because the id is a field in
     * the body the client controls, not the resource being addressed.
     */
    let inheritFrom: { id: string; key: string; name: string } | null = null;
    if (body.inheritFromEnvironmentId) {
      const [source] = await app.db
        .select({ id: environments.id, key: environments.key, name: environments.name })
        .from(environments)
        .where(
          and(
            eq(environments.id, body.inheritFromEnvironmentId),
            eq(environments.projectId, projectId),
          ),
        );
      if (!source)
        throw badRequest('inheritFromEnvironmentId is not an environment of this project');
      inheritFrom = source;
    }

    const created = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(environments)
        .values({ projectId, key: body.key, name: body.name })
        .returning();
      if (!row) throw new Error('environment insert failed');
      /*
       * Keep the invariant: a flag-state row exists for every (tool, env) pair.
       *
       * `defaultValue` is selected alongside the id and seeded into `value`, so
       * a typed flag starts the new environment on its definition's default. Miss
       * it and every new environment silently serves empty strings for every
       * non-boolean flag - and nothing complains, because a NULL `value` is
       * perfectly valid for the boolean flags every existing test uses.
       */
      const toolRows = await tx
        .select({ id: tools.id, defaultValue: tools.defaultValue })
        .from(tools)
        .where(eq(tools.projectId, projectId));
      if (toolRows.length > 0) {
        await tx
          .insert(flagStates)
          .values(
            toolRows.map((t) => ({
              toolId: t.id,
              environmentId: row.id,
              value: t.defaultValue,
            })),
          )
          .onConflictDoNothing();
      }

      // Inside the same transaction as the insert above, so a failed copy can
      // never leave a half-inherited environment behind.
      const copied: CopiedResource[] = inheritFrom
        ? await inheritEnvironment({
            tx,
            fromEnvironmentId: inheritFrom.id,
            toEnvironmentId: row.id,
            actorId: req.auth.user.id,
          })
        : [];

      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'environment.create',
        entityType: 'environment',
        entityId: row.id,
        after: {
          key: row.key,
          name: row.name,
          projectId,
          ...(inheritFrom && {
            inheritedFrom: { id: inheritFrom.id, key: inheritFrom.key },
            copied: Object.fromEntries(copied.map((c) => [c.key, c.count])),
          }),
        },
      });
      return { ...row, inheritedFrom: inheritFrom, copied };
    });
    app.publisher.scheduleRuleset(created.id);
    return reply.status(201).send(created);
  });

  app.patch('/v1/environments/:environmentId', async (req) => {
    const { environmentId } = environmentParams.parse(req.params);
    const body = environmentPatchBody.parse(req.body);
    const scope = await resolveEnvironment(app.db, req.auth, environmentId, 'admin');

    return app.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(environments)
        .where(eq(environments.id, environmentId));
      if (!before) throw notFound('environment');
      const [after] = await tx
        .update(environments)
        .set({ name: body.name })
        .where(eq(environments.id, environmentId))
        .returning();
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'environment.update',
        entityType: 'environment',
        entityId: environmentId,
        before: { name: before.name },
        after: { name: after?.name },
      });
      return after;
    });
  });

  app.delete('/v1/environments/:environmentId', async (req, reply) => {
    const { environmentId } = environmentParams.parse(req.params);
    const scope = await resolveEnvironment(app.db, req.auth, environmentId, 'admin');

    await app.db.transaction(async (tx) => {
      await tx.delete(environments).where(eq(environments.id, environmentId));
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'environment.delete',
        entityType: 'environment',
        entityId: environmentId,
        before: { key: scope.environmentKey },
      });
    });
    await app.publisher.removeEnvironment(environmentId);
    return reply.status(204).send();
  });
}
