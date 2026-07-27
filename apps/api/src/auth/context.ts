/**
 * Per-request auth context: verify the bearer token, provision the user on
 * first login (Keycloak `sub` link), bootstrap a personal org when the user
 * belongs to none, and load org memberships for RBAC.
 */
import { eq } from 'drizzle-orm';

import type { Db } from '../db';
import { orgMemberships, orgs, users, type User } from '../db/schema';
import { writeAudit } from '../lib/audit';
import type { TokenClaims } from './verifier';

export type Role = 'admin' | 'developer' | 'viewer';

export interface AuthContext {
  user: User;
  /** orgId → role */
  roles: Map<string, Role>;
}

async function findUser(db: Db, sub: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.keycloakSub, sub));
  return rows[0];
}

async function provisionUser(db: Db, claims: TokenClaims): Promise<User> {
  const existing = await findUser(db, claims.sub);
  if (existing) return existing;

  await db
    .insert(users)
    .values({
      keycloakSub: claims.sub,
      email: claims.email ?? `${claims.sub}@unknown.invalid`,
      displayName: claims.name ?? claims.preferredUsername ?? null,
    })
    .onConflictDoNothing({ target: users.keycloakSub });
  const user = await findUser(db, claims.sub);
  if (!user) throw new Error('user provisioning failed');
  return user;
}

async function loadRoles(db: Db, userId: string): Promise<Map<string, Role>> {
  const memberships = await db
    .select({ orgId: orgMemberships.orgId, role: orgMemberships.role })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId));
  return new Map(memberships.map((m) => [m.orgId, m.role]));
}

async function bootstrapOrg(db: Db, user: User): Promise<void> {
  const ownerLabel = user.displayName ?? user.email;
  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(orgs)
      .values({ name: `${ownerLabel}'s Org` })
      .returning();
    if (!org) throw new Error('org bootstrap failed');
    await tx
      .insert(orgMemberships)
      .values({ orgId: org.id, userId: user.id, role: 'admin' })
      .onConflictDoNothing();
    await writeAudit(tx, {
      orgId: org.id,
      actorId: user.id,
      action: 'org.bootstrap',
      entityType: 'org',
      entityId: org.id,
      after: { name: org.name },
    });
  });
}

export async function buildAuthContext(db: Db, claims: TokenClaims): Promise<AuthContext> {
  const user = await provisionUser(db, claims);
  let roles = await loadRoles(db, user.id);
  if (roles.size === 0) {
    await bootstrapOrg(db, user);
    roles = await loadRoles(db, user.id);
  }
  return { user, roles };
}
