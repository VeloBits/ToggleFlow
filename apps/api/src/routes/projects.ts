import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireOrgRole, resolveEnvironment, resolveProject } from '../auth/rbac';
import { environments, flagStates, projects, tools } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { publishEnvironment } from '../lib/publish';

const DEFAULT_ENVIRONMENTS = [
  { key: 'dev', name: 'Development' },
  { key: 'staging', name: 'Staging' },
  { key: 'prod', name: 'Production' },
] as const;

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

    const environment = await app.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(environments)
        .values({ projectId, key: body.key, name: body.name })
        .returning();
      if (!row) throw new Error('environment insert failed');
      // Keep the invariant: a flag-state row exists for every (tool, env) pair.
      const toolRows = await tx
        .select({ id: tools.id })
        .from(tools)
        .where(eq(tools.projectId, projectId));
      if (toolRows.length > 0) {
        await tx
          .insert(flagStates)
          .values(toolRows.map((t) => ({ toolId: t.id, environmentId: row.id })))
          .onConflictDoNothing();
      }
      await writeAudit(tx, {
        orgId: scope.orgId,
        actorId: req.auth.user.id,
        action: 'environment.create',
        entityType: 'environment',
        entityId: row.id,
        after: { key: row.key, name: row.name, projectId },
      });
      return row;
    });
    await publishEnvironment(environment.id);
    return reply.status(201).send(environment);
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
    return reply.status(204).send();
  });
}
