import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditLog, users } from '../src/db/schema';
import { setupTestApp, type TestHarness } from './helpers';

let h: TestHarness;

beforeAll(async () => {
  h = await setupTestApp();
});
afterAll(async () => {
  await h.app.close();
});

describe('authentication', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects garbage tokens', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: h.authed('not-a-jwt'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects tokens with the wrong audience', async () => {
    const token = await h.signToken('wrong-aud', { audience: 'somebody-else' });
    const res = await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(token) });
    expect(res.statusCode).toBe(401);
  });

  it('rejects tokens from the wrong issuer', async () => {
    const token = await h.signToken('wrong-iss', {
      issuer: 'http://keycloak.test/realms/other',
    });
    const res = await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(token) });
    expect(res.statusCode).toBe(401);
  });

  it('leaves /health public', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('first-login provisioning', () => {
  it('provisions the user and bootstraps a personal org with the admin role', async () => {
    const token = await h.signToken('first-login', { email: 'first@example.test' });
    const res = await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(token) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe('first@example.test');
    expect(body.orgs).toHaveLength(1);
    expect(body.orgs[0].role).toBe('admin');

    const [dbUser] = await h.db.select().from(users).where(eq(users.keycloakSub, 'first-login'));
    expect(dbUser).toBeDefined();

    const entries = await h.db.select().from(auditLog).where(eq(auditLog.orgId, body.orgs[0].id));
    expect(entries.map((e) => e.action)).toContain('org.bootstrap');
  });

  it('is idempotent — a second request reuses the same user and org', async () => {
    const token = await h.signToken('first-login');
    const res = await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().orgs).toHaveLength(1);
    const rows = await h.db.select().from(users).where(eq(users.keycloakSub, 'first-login'));
    expect(rows).toHaveLength(1);
  });
});
