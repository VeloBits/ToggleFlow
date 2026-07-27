import configFallbackFixture from '@toggleflow/engine/fixtures/config-fallback.json';
import killSwitchFixture from '@toggleflow/engine/fixtures/kill-switch.json';
import rolloutFixture from '@toggleflow/engine/fixtures/rollout.json';
import targetingFixture from '@toggleflow/engine/fixtures/targeting.json';
import type { ToolEvaluation } from '@toggleflow/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createServerClient,
  type ToggleFlowServerClient,
  type UserContextInput,
} from '../src/server';
import { createFakeFetch, hangForever, jsonResponse, notModified } from './fake-fetch';

interface GoldenFixture {
  snapshot: unknown;
  cases: { name: string; toolKey: string; context: UserContextInput; expected: ToolEvaluation }[];
}
const asGolden = (fixture: unknown) => fixture as GoldenFixture;

const GOLDEN_FIXTURES = {
  'kill-switch': asGolden(killSwitchFixture),
  targeting: asGolden(targetingFixture),
  rollout: asGolden(rolloutFixture),
  'config-fallback': asGolden(configFallbackFixture),
};

const openClients: ToggleFlowServerClient[] = [];
const track = (client: ToggleFlowServerClient) => {
  openClients.push(client);
  return client;
};

afterEach(() => {
  for (const client of openClients.splice(0)) client.close();
  vi.useRealTimers();
});

describe('local evaluation matches the engine golden fixtures', () => {
  for (const [name, fixture] of Object.entries(GOLDEN_FIXTURES)) {
    it(`fixture: ${name}`, async () => {
      const fake = createFakeFetch(notModified);
      const client = track(
        createServerClient({
          edgeUrl: 'http://edge.test',
          environmentId: 'env-x',
          serverKey: 'tf_srv_test',
          bootstrap: fixture.snapshot,
          fetch: fake.fetch,
        }),
      );
      await client.waitForReady();
      for (const testCase of fixture.cases) {
        expect(client.evaluate(testCase.toolKey, testCase.context), testCase.name).toEqual(
          testCase.expected,
        );
      }
    });
  }
});

describe('polling with ETags', () => {
  const snapshotV1 = targetingFixture.snapshot;
  const snapshotV2 = { ...snapshotV1, version: 13, tools: { 'tool.solo': { enabled: true } } };

  it('boot-fetches, then polls every 30s (default) with If-None-Match', async () => {
    vi.useFakeTimers();
    const fake = createFakeFetch(() => jsonResponse(snapshotV1, { etag: '"h1"' }));
    const client = track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-prod',
        serverKey: 'tf_srv_test',
        fetch: fake.fetch,
      }),
    );
    await client.waitForReady();
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.url).toBe('http://edge.test/v1/ruleset?environment=env-prod');
    expect(fake.calls[0]!.headers.get('authorization')).toBe('Bearer tf_srv_test');
    expect(fake.calls[0]!.headers.get('if-none-match')).toBeNull();

    fake.setHandler(notModified);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fake.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]!.headers.get('if-none-match')).toBe('"h1"');
  });

  it('applies updates and notifies subscribers; 304 stays silent', async () => {
    vi.useFakeTimers();
    const fake = createFakeFetch(() => jsonResponse(snapshotV1, { etag: '"h1"' }));
    const client = track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-prod',
        serverKey: 'tf_srv_test',
        fetch: fake.fetch,
      }),
    );
    await client.waitForReady();
    const updates: number[] = [];
    client.subscribe((update) => updates.push(update.version));

    fake.setHandler(notModified);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(updates).toEqual([]);

    fake.setHandler(() => jsonResponse(snapshotV2, { etag: '"h2"' }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(updates).toEqual([13]);
    expect(client.isEnabled('tool.solo')).toBe(true);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fake.calls.at(-1)!.headers.get('if-none-match')).toBe('"h2"');
  });

  it('serves stale on errors and recovers on the next good poll', async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const fake = createFakeFetch(() => jsonResponse(snapshotV1, { etag: '"h1"' }));
    const client = track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-prod',
        serverKey: 'tf_srv_test',
        fetch: fake.fetch,
        onError: (err) => errors.push(err.message),
      }),
    );
    await client.waitForReady();
    expect(client.isEnabled('tool.eu-disabled', { key: 'u', attributes: { region: 'us' } })).toBe(
      true,
    );

    fake.setHandler(() => {
      throw new Error('network down');
    });
    await vi.advanceTimersByTimeAsync(30_000);
    fake.setHandler(() => new Response('kaput', { status: 503 }));
    await vi.advanceTimersByTimeAsync(30_000);

    expect(errors).toHaveLength(2);
    // The outage never touched the cached ruleset.
    expect(client.ready).toBe(true);
    expect(client.isEnabled('tool.eu-disabled', { key: 'u', attributes: { region: 'us' } })).toBe(
      true,
    );

    fake.setHandler(() => jsonResponse(snapshotV2, { etag: '"h2"' }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(client.isEnabled('tool.solo')).toBe(true);
  });

  it('a bootstrap snapshot serves instantly while the first fetch is still in flight', async () => {
    const fake = createFakeFetch(hangForever);
    const client = track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-prod',
        serverKey: 'tf_srv_test',
        bootstrap: killSwitchFixture.snapshot,
        fetch: fake.fetch,
      }),
    );
    expect(client.ready).toBe(true);
    expect(client.evaluate('tool.translate', { key: 'u' }).reason).toBe('kill_switch');
  });

  it('close() stops polling', async () => {
    vi.useFakeTimers();
    const fake = createFakeFetch(() => jsonResponse(snapshotV1, { etag: '"h1"' }));
    const client = createServerClient({
      edgeUrl: 'http://edge.test',
      environmentId: 'env-prod',
      serverKey: 'tf_srv_test',
      fetch: fake.fetch,
    });
    await client.waitForReady();
    client.close();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fake.calls).toHaveLength(1);
  });

  it('waitForReady(timeout) rejects when nothing ever loads', async () => {
    vi.useFakeTimers();
    const fake = createFakeFetch(hangForever);
    const client = track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-prod',
        serverKey: 'tf_srv_test',
        fetch: fake.fetch,
      }),
    );
    const pending = expect(client.waitForReady(50)).rejects.toThrow('no ruleset after 50ms');
    await vi.advanceTimersByTimeAsync(51);
    await pending;
  });

  it('evaluates to safe defaults before any ruleset is available', () => {
    const fake = createFakeFetch(hangForever);
    const client = track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-prod',
        serverKey: 'tf_srv_test',
        fetch: fake.fetch,
      }),
    );
    expect(client.ready).toBe(false);
    expect(client.isEnabled('tool.anything')).toBe(false);
    expect(client.evaluate('tool.anything').reason).toBe('not_found');
    expect(client.evaluateAll()).toEqual({});
  });
});
