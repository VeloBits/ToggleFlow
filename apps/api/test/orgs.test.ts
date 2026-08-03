import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupTestApp, type TestHarness } from './helpers';

let h: TestHarness;
let token: string;

beforeAll(async () => {
  h = await setupTestApp();
  token = await h.signToken('org-creator');
});
afterAll(async () => {
  await h.app.close();
});

// Typed as an object rather than `unknown`: inject() overloads on the payload,
// and an `unknown` argument resolves it to the chainable form with no .json().
const createOrg = (payload: Record<string, unknown>, as = token) =>
  h.app.inject({ method: 'POST', url: '/v1/orgs', headers: h.authed(as), payload });

describe('org creation', () => {
  it('creates an org with the caller as admin and lists it on /v1/me', async () => {
    // First call also bootstraps the caller's personal org, so /v1/me starts at one.
    const before = await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(token) });
    expect(before.json().orgs).toHaveLength(1);

    const res = await createOrg({ name: 'Acme' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Acme', role: 'admin' });

    const after = await h.app.inject({ method: 'GET', url: '/v1/me', headers: h.authed(token) });
    const acme = after.json().orgs.find((o: { name: string }) => o.name === 'Acme');
    expect(after.json().orgs).toHaveLength(2);
    expect(acme.role).toBe('admin');
  });

  it('lets the creator immediately use org-scoped endpoints', async () => {
    // The membership is written inside this request, so the guard against a
    // stale auth context is what this asserts: create org -> create project.
    const org = await createOrg({ name: 'Immediate' });
    const orgId = org.json().id;

    const project = await h.app.inject({
      method: 'POST',
      url: `/v1/orgs/${orgId}/projects`,
      headers: h.authed(token),
      payload: { name: 'First' },
    });
    expect(project.statusCode).toBe(201);
    expect(project.json().environments.map((e: { key: string }) => e.key)).toEqual(['prod']);
  });

  it('writes an org.create audit entry scoped to the new org', async () => {
    const org = await createOrg({ name: 'Audited' });
    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${org.json().id}/audit`,
      headers: h.authed(token),
    });
    expect(audit.json().entries).toHaveLength(1);
    expect(audit.json().entries[0]).toMatchObject({
      action: 'org.create',
      entityType: 'org',
      after: { name: 'Audited' },
    });
  });

  it('trims the name and rejects blank or oversized ones', async () => {
    const trimmed = await createOrg({ name: '  Spaced  ' });
    expect(trimmed.json().name).toBe('Spaced');

    for (const name of ['', '   ', 'x'.repeat(201)]) {
      const res = await createOrg({ name });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('validation_error');
    }
  });

  it('rejects an unauthenticated caller', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/orgs', payload: { name: 'Nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('keeps orgs private to their creator', async () => {
    const mine = await createOrg({ name: 'Private' });
    const stranger = await h.signToken('org-stranger');
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${mine.json().id}/projects`,
      headers: h.authed(stranger),
    });
    // 404, not 403 - non-members must not be able to enumerate tenants (rbac.ts).
    expect(res.statusCode).toBe(404);
  });
});
