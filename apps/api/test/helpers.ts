/**
 * Integration-test harness: a real Fastify app against the dev Postgres
 * (:5434), with tokens signed by a local RS256 key and verified through the
 * SAME verifier code path production uses (issuer + audience checks included).
 */
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { FastifyInstance } from 'fastify';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';

import { createTokenVerifier } from '../src/auth/verifier';
import type { Db } from '../src/db';
import { orgMemberships, users } from '../src/db/schema';
import { buildServer } from '../src/server';

export const TEST_ISSUER = 'http://keycloak.test/realms/Velobits-Dev';
export const TEST_AUDIENCE = 'toggleflow-api';

export interface SignOptions {
  email?: string;
  name?: string;
  audience?: string | string[];
  issuer?: string;
}

export interface TestHarness {
  app: FastifyInstance;
  db: Db;
  signToken: (sub: string, opts?: SignOptions) => Promise<string>;
  authed: (token: string) => Record<string, string>;
}

export async function setupTestApp(): Promise<TestHarness> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const getKey = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] });

  const app = await buildServer({
    verifier: createTokenVerifier({ issuer: TEST_ISSUER, audience: TEST_AUDIENCE, getKey }),
  });
  await migrate(app.db, { migrationsFolder: 'drizzle' });
  await resetDb(app.db);

  const signToken = (sub: string, opts: SignOptions = {}) =>
    new SignJWT({
      email: opts.email ?? `${sub}@example.test`,
      name: opts.name ?? `User ${sub}`,
      preferred_username: sub,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(opts.issuer ?? TEST_ISSUER)
      .setAudience(opts.audience ?? [TEST_AUDIENCE, 'account'])
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

  return {
    app,
    db: app.db,
    signToken,
    authed: (token) => ({ authorization: `Bearer ${token}` }),
  };
}

export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`
    truncate table audit_log, api_keys, ruleset_versions, config_versions, tool_configs,
      segments, flag_states, tools, environments, projects, org_memberships, users, orgs
    restart identity cascade
  `);
}

/** Insert a user + membership directly (membership management endpoints are a later phase). */
export async function addMember(
  db: Db,
  orgId: string,
  sub: string,
  role: 'admin' | 'developer' | 'viewer',
): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ keycloakSub: sub, email: `${sub}@example.test`, displayName: `User ${sub}` })
    .returning();
  if (!user) throw new Error('test user insert failed');
  await db.insert(orgMemberships).values({ orgId, userId: user.id, role });
  return user.id;
}

export interface Workspace {
  orgId: string;
  projectId: string;
  environments: { id: string; key: string }[];
  adminToken: string;
}

/** First-login as `admin-<suffix>` (bootstraps an org), then create a project with default envs. */
export async function createWorkspace(h: TestHarness, suffix = '1'): Promise<Workspace> {
  const adminToken = await h.signToken(`admin-${suffix}`);
  const me = await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(adminToken) });
  if (me.statusCode !== 200) throw new Error(`me failed: ${me.body}`);
  const orgId = me.json().orgs[0].id as string;

  const created = await h.app.inject({
    method: 'POST',
    url: `/v1/orgs/${orgId}/projects`,
    headers: h.authed(adminToken),
    payload: { name: `Project ${suffix}` },
  });
  if (created.statusCode !== 201) throw new Error(`project create failed: ${created.body}`);
  const project = created.json();
  return {
    orgId,
    projectId: project.id as string,
    environments: project.environments.map((e: { id: string; key: string }) => ({
      id: e.id,
      key: e.key,
    })),
    adminToken,
  };
}
