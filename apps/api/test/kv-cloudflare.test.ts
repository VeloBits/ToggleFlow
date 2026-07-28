/**
 * The production KV client, driven against a stubbed `fetch`. This is the one
 * path that cannot be exercised for real in CI — it talks to api.cloudflare.com
 * — so the contract is pinned here instead: URL shape, auth header, the
 * multipart body, and which HTTP statuses are errors versus expected misses.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCloudflareKvClient } from '../src/lib/kv';

const ACCOUNT = 'acct-123';
const NAMESPACE = 'ns-456';
const TOKEN = 'cf-token';
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces/${NAMESPACE}`;

const client = () =>
  createCloudflareKvClient({ accountId: ACCOUNT, namespaceId: NAMESPACE, apiToken: TOKEN });

/** Queue one response per expected fetch, in order. */
function stubFetch(...responses: Response[]) {
  const spy = vi.fn<typeof fetch>();
  for (const res of responses) spy.mockResolvedValueOnce(res);
  vi.stubGlobal('fetch', spy);
  return spy;
}

const ok = (body = '', status = 200) => new Response(body, { status });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('put', () => {
  it('PUTs a multipart body with value and metadata to the values endpoint', async () => {
    const spy = stubFetch(ok());
    await client().put('ruleset:env-1', '{"flags":[]}', { contentHash: 'abc', version: 7 });

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/values/ruleset%3Aenv-1`);
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);

    const form = init?.body as FormData;
    expect(form.get('value')).toBe('{"flags":[]}');
    expect(JSON.parse(form.get('metadata') as string)).toEqual({
      contentHash: 'abc',
      version: 7,
    });
  });

  it('sends an empty metadata object when none is supplied', async () => {
    const spy = stubFetch(ok());
    await client().put('keys:env-1', 'payload');
    const form = spy.mock.calls[0]![1]!.body as FormData;
    expect(form.get('metadata')).toBe('{}');
  });

  it('throws with the status when Cloudflare rejects the write', async () => {
    stubFetch(ok('denied', 403));
    await expect(client().put('ruleset:env-1', 'x')).rejects.toThrow(
      'KV put ruleset:env-1 failed: HTTP 403',
    );
  });
});

describe('getWithMetadata', () => {
  it('returns the value and the metadata result', async () => {
    const spy = stubFetch(
      ok('{"flags":[]}'),
      ok(JSON.stringify({ result: { contentHash: 'abc', version: 7 } })),
    );

    const entry = await client().getWithMetadata('ruleset:env-1');
    expect(entry).toEqual({ value: '{"flags":[]}', metadata: { contentHash: 'abc', version: 7 } });
    expect(spy.mock.calls[0]![0]).toBe(`${BASE}/values/ruleset%3Aenv-1`);
    expect(spy.mock.calls[1]![0]).toBe(`${BASE}/metadata/ruleset%3Aenv-1`);
  });

  it('treats a 404 as an empty entry and never asks for metadata', async () => {
    const spy = stubFetch(ok('', 404));
    expect(await client().getWithMetadata('missing')).toEqual({ value: null, metadata: null });
    // A miss is normal — the second round trip would be wasted.
    expect(spy).toHaveBeenCalledOnce();
  });

  it('keeps the value when the metadata request fails', async () => {
    stubFetch(ok('body'), ok('', 500));
    expect(await client().getWithMetadata('k')).toEqual({ value: 'body', metadata: null });
  });

  it('nulls the metadata when the response carries no result', async () => {
    stubFetch(ok('body'), ok(JSON.stringify({})));
    expect(await client().getWithMetadata('k')).toEqual({ value: 'body', metadata: null });
  });

  it('throws on a non-404 read failure', async () => {
    stubFetch(ok('', 500));
    await expect(client().getWithMetadata('k')).rejects.toThrow('KV get k failed: HTTP 500');
  });
});

describe('delete', () => {
  it('DELETEs the value endpoint', async () => {
    const spy = stubFetch(ok());
    await client().delete('ruleset:env-1');
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/values/ruleset%3Aenv-1`);
    expect(init?.method).toBe('DELETE');
  });

  it('tolerates a 404 — deleting an absent key is a no-op', async () => {
    stubFetch(ok('', 404));
    await expect(client().delete('missing')).resolves.toBeUndefined();
  });

  it('throws on any other failure', async () => {
    stubFetch(ok('', 500));
    await expect(client().delete('k')).rejects.toThrow('KV delete k failed: HTTP 500');
  });
});
