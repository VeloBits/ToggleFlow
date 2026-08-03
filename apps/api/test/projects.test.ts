import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addMember,
  createWorkspace,
  setupTestApp,
  type TestHarness,
  type Workspace,
} from './helpers';

let h: TestHarness;
let ws: Workspace;
let developerToken: string;
let viewerToken: string;

beforeAll(async () => {
  h = await setupTestApp();
  ws = await createWorkspace(h);
  await addMember(h.db, ws.orgId, 'dev-user', 'developer');
  await addMember(h.db, ws.orgId, 'viewer-user', 'viewer');
  developerToken = await h.signToken('dev-user');
  viewerToken = await h.signToken('viewer-user');
});
afterAll(async () => {
  await h.app.close();
});

describe('projects', () => {
  it('creates a project with Production as its only environment', async () => {
    expect(ws.environments.map((e) => e.key)).toEqual(['prod']);
  });

  it('lists and fetches projects for members', async () => {
    const list = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/projects`,
      headers: h.authed(viewerToken),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    const get = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}`,
      headers: h.authed(viewerToken),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().environments).toHaveLength(1);
  });

  it('renames a project and writes an audit entry with before/after', async () => {
    const res = await h.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${ws.projectId}`,
      headers: h.authed(ws.adminToken),
      payload: { name: 'Renamed Project' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Renamed Project');

    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit`,
      headers: h.authed(ws.adminToken),
    });
    const entry = audit
      .json()
      .entries.find((e: { action: string }) => e.action === 'project.update');
    expect(entry.before.name).toBe('Project 1');
    expect(entry.after.name).toBe('Renamed Project');
  });

  it('blocks project creation for developers and rename for viewers', async () => {
    const create = await h.app.inject({
      method: 'POST',
      url: `/v1/orgs/${ws.orgId}/projects`,
      headers: h.authed(developerToken),
      payload: { name: 'Nope' },
    });
    expect(create.statusCode).toBe(403);

    const patch = await h.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${ws.projectId}`,
      headers: h.authed(viewerToken),
      payload: { name: 'Nope' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('hides foreign projects from non-members (404, not 403)', async () => {
    const stranger = await h.signToken('stranger');
    const res = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${ws.projectId}`,
      headers: h.authed(stranger),
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes a project', async () => {
    const other = await h.app.inject({
      method: 'POST',
      url: `/v1/orgs/${ws.orgId}/projects`,
      headers: h.authed(ws.adminToken),
      payload: { name: 'Disposable' },
    });
    const projectId = other.json().id;
    const del = await h.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${projectId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(del.statusCode).toBe(204);
    const get = await h.app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(get.statusCode).toBe(404);
  });
});

describe('environments', () => {
  it('creates a custom environment (admin only) and rejects duplicates', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'qa', name: 'QA' },
    });
    expect(res.statusCode).toBe(201);

    const dup = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'qa', name: 'QA again' },
    });
    expect(dup.statusCode).toBe(409);

    const forbidden = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: h.authed(developerToken),
      payload: { key: 'qa2', name: 'QA 2' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('rejects invalid environment keys', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'QA Env!', name: 'Bad key' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('renames and deletes an environment with audit entries', async () => {
    const created = await h.app.inject({
      method: 'POST',
      url: `/v1/projects/${ws.projectId}/environments`,
      headers: h.authed(ws.adminToken),
      payload: { key: 'temp', name: 'Temp' },
    });
    const envId = created.json().id;

    const patched = await h.app.inject({
      method: 'PATCH',
      url: `/v1/environments/${envId}`,
      headers: h.authed(ws.adminToken),
      payload: { name: 'Temporary' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().name).toBe('Temporary');

    const del = await h.app.inject({
      method: 'DELETE',
      url: `/v1/environments/${envId}`,
      headers: h.authed(ws.adminToken),
    });
    expect(del.statusCode).toBe(204);

    const audit = await h.app.inject({
      method: 'GET',
      url: `/v1/orgs/${ws.orgId}/audit?limit=200`,
      headers: h.authed(ws.adminToken),
    });
    const actions = audit.json().entries.map((e: { action: string }) => e.action);
    expect(actions).toContain('environment.update');
    expect(actions).toContain('environment.delete');
  });
});
