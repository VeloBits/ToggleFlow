import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBrowserClient,
  type FlagsSnapshot,
  type ToggleFlowBrowserClient,
} from '../src/browser';
import { createFakeFetch, hangForever, jsonResponse } from './fake-fetch';

/**
 * Shaped exactly like the edge's `/v1/flags` body (apps/edge-worker/API.md):
 * `value` mirrors `enabled` for boolean flags, and a typed flag carries the
 * string the edge resolved for this user.
 */
const payloadV1: FlagsSnapshot = {
  environmentId: 'env-1',
  environmentKey: 'prod',
  version: 1,
  flags: {
    'tool.a': {
      enabled: false,
      value: false,
      valueType: 'boolean',
      config: { limit: 5 },
      fallback: { mode: 'hide' },
    },
    'tool.b': { enabled: true, value: true, valueType: 'boolean', config: null, fallback: null },
    'tool.copy': {
      enabled: true,
      value: 'the new wording',
      valueType: 'string',
      config: { fallback: 'the old wording' },
      fallback: 'the old wording',
    },
  },
};
const payloadV2: FlagsSnapshot = {
  ...payloadV1,
  version: 2,
  flags: {
    ...payloadV1.flags,
    'tool.a': {
      enabled: true,
      value: true,
      valueType: 'boolean',
      config: { limit: 9 },
      fallback: null,
    },
  },
};

const openClients: ToggleFlowBrowserClient[] = [];
const create = (
  fetch: typeof globalThis.fetch,
  user = { key: 'u1', attributes: { plan: 'pro' } },
) => {
  const client = createBrowserClient({
    edgeUrl: 'http://edge.test',
    environmentId: 'env-1',
    clientKey: 'tf_cli_test',
    user,
    fetch,
  });
  openClients.push(client);
  return client;
};

afterEach(() => {
  for (const client of openClients.splice(0)) client.close();
  vi.useRealTimers();
});

describe('browser client', () => {
  it('fetches evaluated flags with user context and the client key', async () => {
    const fake = createFakeFetch(() => jsonResponse(payloadV1));
    const client = create(fake.fetch);
    await client.waitForReady();

    const url = new URL(fake.calls[0]!.url);
    expect(url.pathname).toBe('/v1/flags');
    expect(url.searchParams.get('environment')).toBe('env-1');
    expect(url.searchParams.get('user')).toBe('u1');
    expect(url.searchParams.get('attributes')).toBe('{"plan":"pro"}');
    expect(fake.calls[0]!.headers.get('authorization')).toBe('Bearer tf_cli_test');

    expect(client.isEnabled('tool.a')).toBe(false);
    expect(client.isEnabled('tool.b')).toBe(true);
    expect(client.getConfig('tool.a')).toEqual({ limit: 5 });
    expect(client.getFallback('tool.a')).toEqual({ mode: 'hide' });
    expect(client.isEnabled('tool.unknown')).toBe(false);
    expect(Object.keys(client.allFlags())).toHaveLength(3);
  });

  it('reads typed values, deferring to the caller default when it has no string to give', async () => {
    const fake = createFakeFetch(() => jsonResponse(payloadV1));
    const client = create(fake.fetch);
    await client.waitForReady();

    expect(client.getValue('tool.copy')).toBe('the new wording');
    expect(client.getStringValue('tool.copy', 'caller default')).toBe('the new wording');
    // Boolean flags: value mirrors enabled, both directions.
    expect(client.getValue('tool.a')).toBe(false);
    expect(client.getBooleanValue('tool.a', true)).toBe(false);
    expect(client.getBooleanValue('tool.b', false)).toBe(true);
    // Unknown key and wrong runtime type both defer to the caller.
    expect(client.getValue('tool.unknown')).toBeNull();
    expect(client.getStringValue('tool.unknown', 'caller default')).toBe('caller default');
    expect(client.getStringValue('tool.b', 'caller default')).toBe('caller default');
    expect(client.getBooleanValue('tool.copy', true)).toBe(true);
  });

  it('tolerates a payload from an edge worker predating typed values', async () => {
    // The response is cast, not parsed, so absent fields are reachable however
    // FlagsSnapshot is typed - during a staged edge rollout, a new page can be
    // talking to an old worker. `undefined` must never reach the caller.
    const legacy = {
      ...payloadV1,
      flags: { 'tool.a': { enabled: true, config: null, fallback: null } },
    } as unknown as FlagsSnapshot;
    const fake = createFakeFetch(() => jsonResponse(legacy));
    const client = create(fake.fetch);
    await client.waitForReady();

    expect(client.isEnabled('tool.a')).toBe(true);
    expect(client.getValue('tool.a')).toBeNull();
    expect(client.getStringValue('tool.a', 'caller default')).toBe('caller default');
    expect(client.getBooleanValue('tool.a', true)).toBe(true);
  });

  it('notifies subscribers only when the evaluated set changes', async () => {
    vi.useFakeTimers();
    const fake = createFakeFetch(() => jsonResponse(payloadV1));
    const client = create(fake.fetch);
    await client.waitForReady();
    const seen: number[] = [];
    client.subscribe((flags) => seen.push(flags.version));

    await vi.advanceTimersByTimeAsync(30_000); // identical payload
    expect(seen).toEqual([]);

    fake.setHandler(() => jsonResponse(payloadV2));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(seen).toEqual([2]);
    expect(client.isEnabled('tool.a')).toBe(true);
  });

  it('identify() refetches immediately for the new user', async () => {
    const fake = createFakeFetch(() => jsonResponse(payloadV1));
    const client = create(fake.fetch);
    await client.waitForReady();
    expect(fake.calls).toHaveLength(1);

    await client.identify({ key: 'u2' });
    expect(fake.calls).toHaveLength(2);
    const url = new URL(fake.calls[1]!.url);
    expect(url.searchParams.get('user')).toBe('u2');
    expect(url.searchParams.get('attributes')).toBeNull();
  });

  it('serves stale flags through outages', async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const fake = createFakeFetch(() => jsonResponse(payloadV1));
    const client = createBrowserClient({
      edgeUrl: 'http://edge.test',
      environmentId: 'env-1',
      clientKey: 'tf_cli_test',
      user: { key: 'u1' },
      fetch: fake.fetch,
      onError: (err) => errors.push(err.message),
    });
    openClients.push(client);
    await client.waitForReady();

    fake.setHandler(() => new Response(null, { status: 503 }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(errors).toHaveLength(1);
    expect(client.isEnabled('tool.b')).toBe(true); // still the last good payload
  });

  it('is safe before the first payload arrives', () => {
    const fake = createFakeFetch(hangForever);
    const client = create(fake.fetch);
    expect(client.ready).toBe(false);
    expect(client.isEnabled('tool.a')).toBe(false);
    expect(client.getConfig('tool.a')).toBeNull();
    expect(client.allFlags()).toEqual({});
  });
});
