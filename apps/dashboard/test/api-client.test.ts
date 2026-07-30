// @vitest-environment happy-dom
/**
 * The fetch wrapper every page goes through: auth header, /api prefix, JSON
 * body handling, and the ApiError mapping that ErrorNote renders.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '../src/api/client';
import { stubAuth, stubFetch } from './harness';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fetchMock = () => vi.mocked(globalThis.fetch);

describe('request wiring', () => {
  it('prefixes /api and attaches the bearer token', async () => {
    stubAuth();
    stubFetch({ 'GET /v1/me': { user: { id: 'u1' } } });

    await api.get('/v1/me');

    const [url, init] = fetchMock().mock.calls[0]!;
    expect(url).toBe('/api/v1/me');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer test-token');
  });

  it('sends an empty bearer token when logged out', async () => {
    stubAuth({ user: null });
    stubFetch({ 'GET /v1/me': {} });

    await api.get('/v1/me');

    const [, init] = fetchMock().mock.calls[0]!;
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer ');
  });

  it('serialises a body and sets content-type only when one is present', async () => {
    stubAuth();
    stubFetch({ 'POST /v1/things': { id: 'x' }, 'DELETE /v1/things/x': { status: 204 } });

    await api.post('/v1/things', { name: 'thing' });
    const [, postInit] = fetchMock().mock.calls[0]!;
    expect(postInit!.body).toBe('{"name":"thing"}');
    expect((postInit!.headers as Record<string, string>)['content-type']).toBe('application/json');

    await api.delete('/v1/things/x');
    const [, delInit] = fetchMock().mock.calls[1]!;
    expect(delInit!.body).toBeUndefined();
    expect((delInit!.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('exposes every verb the pages use', async () => {
    stubAuth();
    stubFetch({
      'GET /v1/x': { v: 'get' },
      'POST /v1/x': { v: 'post' },
      'PUT /v1/x': { v: 'put' },
      'PATCH /v1/x': { v: 'patch' },
      'DELETE /v1/x': { v: 'delete' },
    });

    expect(await api.get('/v1/x')).toEqual({ v: 'get' });
    expect(await api.post('/v1/x', {})).toEqual({ v: 'post' });
    expect(await api.put('/v1/x', {})).toEqual({ v: 'put' });
    expect(await api.patch('/v1/x', {})).toEqual({ v: 'patch' });
    expect(await api.delete('/v1/x')).toEqual({ v: 'delete' });
  });
});

describe('response handling', () => {
  it('returns undefined for 204 without parsing a body', async () => {
    stubAuth();
    stubFetch({ 'DELETE /v1/segments/s1': { status: 204 } });
    expect(await api.delete('/v1/segments/s1')).toBeUndefined();
  });

  it('maps an error payload onto ApiError status/code/message', async () => {
    stubAuth();
    stubFetch({
      'POST /v1/things': { status: 403, body: { error: 'forbidden', message: 'role too low' } },
    });

    const err = await api.post('/v1/things', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: 'forbidden', message: 'role too low' });
  });

  it('falls back to request_failed and the status when the body has no detail', async () => {
    stubAuth();
    stubFetch({ 'GET /v1/x': { status: 500, body: {} } });

    const err = (await api.get('/v1/x').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('request_failed');
    expect(err.message).toBe('HTTP 500');
  });

  it('survives an error response that is not JSON at all', async () => {
    stubAuth();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>gateway timeout</html>', { status: 504 })),
    );

    const err = (await api.get('/v1/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(504);
    expect(err.message).toBe('HTTP 504');
  });
});
