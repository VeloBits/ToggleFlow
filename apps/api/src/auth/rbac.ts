/**
 * RBAC: org-scoped roles with admin > developer > viewer. Entities resolve
 * up to their org; non-existent entities AND entities in orgs the caller
 * does not belong to both yield 404 (no tenant enumeration). 403 is reserved
 * for "you are a member, but your role is too low".
 */
import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import { environments, projects, segments, tools } from '../db/schema';
import { forbidden, notFound } from '../lib/errors';
import type { AuthContext, Role } from './context';

const ROLE_RANK: Record<Role, number> = { viewer: 1, developer: 2, admin: 3 };

export function requireOrgRole(auth: AuthContext, orgId: string, min: Role): void {
  const role = auth.roles.get(orgId);
  if (!role) throw notFound('org');
  if (ROLE_RANK[role] < ROLE_RANK[min]) throw forbidden();
}

export interface ProjectScope {
  projectId: string;
  orgId: string;
}

export interface EnvironmentScope extends ProjectScope {
  environmentId: string;
  environmentKey: string;
}

export async function resolveProject(
  db: Db,
  auth: AuthContext,
  projectId: string,
  min: Role,
): Promise<ProjectScope> {
  const [row] = await db
    .select({ projectId: projects.id, orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!row || !auth.roles.has(row.orgId)) throw notFound('project');
  requireOrgRole(auth, row.orgId, min);
  return row;
}

export async function resolveEnvironment(
  db: Db,
  auth: AuthContext,
  environmentId: string,
  min: Role,
): Promise<EnvironmentScope> {
  const [row] = await db
    .select({
      environmentId: environments.id,
      environmentKey: environments.key,
      projectId: environments.projectId,
      orgId: projects.orgId,
    })
    .from(environments)
    .innerJoin(projects, eq(projects.id, environments.projectId))
    .where(eq(environments.id, environmentId));
  if (!row || !auth.roles.has(row.orgId)) throw notFound('environment');
  requireOrgRole(auth, row.orgId, min);
  return row;
}

export async function resolveTool(
  db: Db,
  auth: AuthContext,
  toolId: string,
  min: Role,
): Promise<ProjectScope & { toolId: string }> {
  const [row] = await db
    .select({ toolId: tools.id, projectId: tools.projectId, orgId: projects.orgId })
    .from(tools)
    .innerJoin(projects, eq(projects.id, tools.projectId))
    .where(eq(tools.id, toolId));
  if (!row || !auth.roles.has(row.orgId)) throw notFound('tool');
  requireOrgRole(auth, row.orgId, min);
  return row;
}

export async function resolveSegment(
  db: Db,
  auth: AuthContext,
  segmentId: string,
  min: Role,
): Promise<ProjectScope & { segmentId: string }> {
  const [row] = await db
    .select({ segmentId: segments.id, projectId: segments.projectId, orgId: projects.orgId })
    .from(segments)
    .innerJoin(projects, eq(projects.id, segments.projectId))
    .where(eq(segments.id, segmentId));
  if (!row || !auth.roles.has(row.orgId)) throw notFound('segment');
  requireOrgRole(auth, row.orgId, min);
  return row;
}
