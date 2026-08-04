import configFallbackFixture from '@toggleflow/engine/fixtures/config-fallback.json';
import killSwitchFixture from '@toggleflow/engine/fixtures/kill-switch.json';
import rolloutFixture from '@toggleflow/engine/fixtures/rollout.json';
import stringValueFixture from '@toggleflow/engine/fixtures/string-value.json';
import targetingFixture from '@toggleflow/engine/fixtures/targeting.json';
import type { ToolEvaluation } from '@toggleflow/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createServerClient,
  type ToggleFlowServerClient,
  type UserContextInput,
} from '../src/server';
import { createFakeFetch, hangForever, jsonResponse, notModified } from './fake-fetch';

/**
 * `expected` is the engine's full `ToolEvaluation` - including the additive
 * `value`/`valueType` - so these fixtures assert that the SDK's local evaluation
 * is the engine's, field for field, with nothing dropped in the pass-through.
 */
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
  'string-value': asGolden(stringValueFixture),
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

describe('typed value accessors', () => {
  const CALLER_DEFAULT = 'the caller default';
  const user: UserContextInput = { key: 'user-1' };

  /** Bootstrapped from the typed fixture; polling parked on 304s. */
  const typedClient = () =>
    track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-x',
        serverKey: 'tf_srv_test',
        bootstrap: stringValueFixture.snapshot,
        fetch: createFakeFetch(notModified).fetch,
      }),
    );

  it('serves the resolved string, including a targeting rule that overrides it', async () => {
    const client = typedClient();
    await client.waitForReady();

    expect(client.getValue('flag.banner-copy', user)).toBe('Deploys are faster now.');
    expect(client.getStringValue('flag.banner-copy', user, CALLER_DEFAULT)).toBe(
      'Deploys are faster now.',
    );
    expect(
      client.getStringValue(
        'flag.summarize-model-targeted',
        { ...user, attributes: { beta: true } },
        CALLER_DEFAULT,
      ),
    ).toBe('quality');
    // The flag is still on for this user, so `isEnabled` and the value agree.
    expect(client.isEnabled('flag.summarize-model-targeted', user)).toBe(true);
  });

  it('serves config.fallback for an off string flag, and the caller default when there is none', async () => {
    const client = typedClient();
    await client.waitForReady();

    // A configured fallback IS the platform's answer, so it beats the caller's
    // default - that is the point of setting one.
    expect(client.getStringValue('flag.banner-copy-off', user, CALLER_DEFAULT)).toBe(
      'Scheduled maintenance tonight.',
    );
    // Off with no fallback resolves to null, and null is not a string.
    expect(client.getValue('flag.banner-copy-no-fallback', user)).toBeNull();
    expect(client.getStringValue('flag.banner-copy-no-fallback', user, CALLER_DEFAULT)).toBe(
      CALLER_DEFAULT,
    );
  });

  it('falls back to the caller default for unknown keys and wrong runtime types', async () => {
    const client = typedClient();
    await client.waitForReady();

    // Unknown key: a typo, or a flag deleted while this process was running.
    expect(client.getValue('flag.never-existed', user)).toBeNull();
    expect(client.getStringValue('flag.never-existed', user, CALLER_DEFAULT)).toBe(CALLER_DEFAULT);
    expect(client.getBooleanValue('flag.never-existed', user, true)).toBe(true);

    // Wrong runtime type: someone retyped the flag in the dashboard, so the code
    // asking for a string now meets a boolean. It must degrade, not throw.
    expect(client.getValue('flag.v1-shaped', user)).toBe(true);
    expect(client.getStringValue('flag.v1-shaped', user, CALLER_DEFAULT)).toBe(CALLER_DEFAULT);
    // ...and symmetrically, a string asked for as a boolean.
    expect(client.getBooleanValue('flag.banner-copy', user, true)).toBe(true);
    expect(client.getBooleanValue('flag.banner-copy', user, false)).toBe(false);
  });

  it('getBooleanValue reports a real false over the caller default - a kill switch is an answer', async () => {
    const client = track(
      createServerClient({
        edgeUrl: 'http://edge.test',
        environmentId: 'env-x',
        serverKey: 'tf_srv_test',
        bootstrap: killSwitchFixture.snapshot,
        fetch: createFakeFetch(notModified).fetch,
      }),
    );
    await client.waitForReady();

    // A kill-switched boolean flag knows the answer is `false`, so a caller
    // whose safe default is `true` still gets `false`. Only the states where we
    // have nothing to say (unknown key, not yet loaded, wrong type) defer.
    expect(client.getBooleanValue('tool.translate', user, true)).toBe(false);
    expect(client.getBooleanValue('tool.summarize', user, false)).toBe(true);
  });

  it('the pre-ready path reports exactly the engine not_found evaluation', () => {
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
    // Whole-object equality: the synthetic evaluation must stay in lockstep with
    // the engine's unknown-key result, or a flag check would answer differently
    // depending on whether the first fetch had landed.
    expect(client.evaluate('flag.banner-copy', user)).toEqual({
      key: 'flag.banner-copy',
      enabled: false,
      reason: 'not_found',
      value: null,
      valueType: 'boolean',
      config: null,
      fallback: null,
    });
    expect(client.getValue('flag.banner-copy', user)).toBeNull();
    expect(client.getStringValue('flag.banner-copy', user, CALLER_DEFAULT)).toBe(CALLER_DEFAULT);
    expect(client.getBooleanValue('flag.banner-copy', user, true)).toBe(true);
  });
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
