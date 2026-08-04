/**
 * Boots the BUILT worker bundle (dist/index.js) in real workerd via
 * miniflare, seeds KV the way the Phase 4 publisher writes it, and drives
 * both endpoints over HTTP. The engine's golden fixtures run through the
 * full worker path - evaluated results must match the frozen expectations.
 *
 * Zero-origin by construction: the only binding is KV; there is no API/DB
 * to call. (The live "origin dead" check is wrangler dev + stopped API.)
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import killSwitchFixture from '@toggleflow/engine/fixtures/kill-switch.json';
import stringValueFixture from '@toggleflow/engine/fixtures/string-value.json';
import targetingFixture from '@toggleflow/engine/fixtures/targeting.json';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SERVER_KEY = 'tf_srv_test-server-key';
const CLIENT_KEY = 'tf_cli_test-client-key';
const TARGETING_ENV = 'env-prod';
const KILL_ENV = 'env-kill';
const STRING_ENV = 'env-typed';

const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

let mf: Miniflare;

type DispatchInit = NonNullable<Parameters<Miniflare['dispatchFetch']>[1]>;

const call = (path: string, init: DispatchInit = {}) =>
  mf.dispatchFetch(`http://worker.local${path}`, init);

const authed = (key: string, extra: Record<string, string> = {}) => ({
  headers: { authorization: `Bearer ${key}`, ...extra },
});

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    // Anchored to this file, not the CWD: the merged coverage run at the repo
    // root (vitest.config.ts `projects`) executes with a different CWD.
    scriptPath: join(import.meta.dirname, '..', 'dist', 'index.js'),
    kvNamespaces: ['RULESETS'],
  });
  const kv = await mf.getKVNamespace('RULESETS');

  await kv.put(`ruleset:${TARGETING_ENV}`, JSON.stringify(targetingFixture.snapshot), {
    metadata: { contentHash: 'targeting-hash-1', version: 12 },
  });
  // The kill-switch fixture also says env-prod internally; seed it under its
  // own KV key - the worker routes purely by KV key.
  await kv.put(`ruleset:${KILL_ENV}`, JSON.stringify(killSwitchFixture.snapshot), {
    metadata: { contentHash: 'kill-hash-1', version: 7 },
  });
  // Typed (string / string_enum) flags, including one v1-shaped entry with no
  // valueType at all - the case that proves the schema defaults survive the
  // worker's read-time safeParse rather than being stripped.
  await kv.put(`ruleset:${STRING_ENV}`, JSON.stringify(stringValueFixture.snapshot), {
    metadata: { contentHash: 'string-hash-1', version: 7 },
  });
  for (const envId of [TARGETING_ENV, KILL_ENV, STRING_ENV]) {
    await kv.put(
      `keys:${envId}`,
      JSON.stringify({ server: [sha256(SERVER_KEY)], client: [sha256(CLIENT_KEY)] }),
    );
  }
  // An environment with keys but no published ruleset yet.
  await kv.put(`keys:env-empty`, JSON.stringify({ server: [sha256(SERVER_KEY)], client: [] }));
}, 60_000);

afterAll(async () => {
  await mf.dispose();
});

describe('key auth (zero origin calls - hashes come from KV)', () => {
  it('rejects missing, malformed, and wrong keys with 401', async () => {
    for (const init of [
      {},
      authed('tf_srv_wrong-key'),
      { headers: { authorization: 'Basic abc' } },
    ]) {
      const res = await call(`/v1/ruleset?environment=${TARGETING_ENV}`, init);
      expect(res.status).toBe(401);
    }
  });

  it('rejects client keys on the ruleset endpoint - rules never reach browsers', async () => {
    const res = await call(`/v1/ruleset?environment=${TARGETING_ENV}`, authed(CLIENT_KEY));
    expect(res.status).toBe(401);
  });

  it('treats unknown environments exactly like bad keys (401, no enumeration)', async () => {
    const res = await call('/v1/ruleset?environment=env-nope', authed(SERVER_KEY));
    expect(res.status).toBe(401);
  });

  it('accepts server keys on the flags endpoint too', async () => {
    const res = await call(`/v1/flags?environment=${TARGETING_ENV}&user=alice`, authed(SERVER_KEY));
    expect(res.status).toBe(200);
  });
});

describe('GET /v1/ruleset', () => {
  it('serves the exact published snapshot with ETag, version, and cache headers', async () => {
    const res = await call(`/v1/ruleset?environment=${TARGETING_ENV}`, authed(SERVER_KEY));
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"targeting-hash-1"');
    expect(res.headers.get('x-ruleset-version')).toBe('12');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual(targetingFixture.snapshot);
  });

  it('answers matching If-None-Match with 304 (strong, weak, and list forms)', async () => {
    for (const value of [
      '"targeting-hash-1"',
      'W/"targeting-hash-1"',
      '"other", "targeting-hash-1"',
      '*',
    ]) {
      const res = await call(
        `/v1/ruleset?environment=${TARGETING_ENV}`,
        authed(SERVER_KEY, { 'if-none-match': value }),
      );
      expect(res.status).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('etag')).toBe('"targeting-hash-1"');
    }
    const changed = await call(
      `/v1/ruleset?environment=${TARGETING_ENV}`,
      authed(SERVER_KEY, { 'if-none-match': '"stale-hash"' }),
    );
    expect(changed.status).toBe(200);
  });

  it('404s when keys exist but nothing has been published', async () => {
    const res = await call('/v1/ruleset?environment=env-empty', authed(SERVER_KEY));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe('ruleset_not_published');
  });

  it('400s without the environment parameter', async () => {
    const res = await call('/v1/ruleset', authed(SERVER_KEY));
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/flags (edge evaluation)', () => {
  interface FixtureCase {
    name: string;
    toolKey: string;
    context: { key: string; attributes?: object };
    expected: {
      enabled: boolean;
      value: unknown;
      valueType: string;
      config: unknown;
      fallback: unknown;
    };
  }

  const runCases = (cases: FixtureCase[], envId: string) => {
    for (const testCase of cases) {
      it(`golden: ${testCase.name}`, async () => {
        const params = new URLSearchParams({ environment: envId, user: testCase.context.key });
        if (testCase.context.attributes) {
          params.set('attributes', JSON.stringify(testCase.context.attributes));
        }
        const res = await call(`/v1/flags?${params}`, authed(CLIENT_KEY));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { flags: Record<string, unknown> };
        /*
         * A whole-object equality, not a subset match: the fixture's `expected`
         * also carries `key` and `reason`, so this asserts the payload contains
         * the five public fields and NOTHING else - `reason` names the rule that
         * fired and must not reach the browser.
         */
        expect(body.flags[testCase.toolKey]).toEqual({
          enabled: testCase.expected.enabled,
          value: testCase.expected.value,
          valueType: testCase.expected.valueType,
          config: testCase.expected.config,
          fallback: testCase.expected.fallback,
        });
      });
    }
  };

  describe('targeting fixture', () => runCases(targetingFixture.cases, TARGETING_ENV));
  describe('kill-switch fixture', () => runCases(killSwitchFixture.cases, KILL_ENV));
  describe('string-value fixture', () => runCases(stringValueFixture.cases, STRING_ENV));

  it('serves a typed string flag end to end, and never leaks the value it withheld', async () => {
    interface TypedFlag {
      enabled: boolean;
      value: unknown;
      valueType: string;
    }
    const flagsFor = async (attributes: object) => {
      const res = await call(
        `/v1/flags?environment=${STRING_ENV}&user=user-1&attributes=${encodeURIComponent(JSON.stringify(attributes))}`,
        authed(CLIENT_KEY),
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      return { text, flags: (JSON.parse(text) as { flags: Record<string, TypedFlag> }).flags };
    };

    const beta = await flagsFor({ beta: true });
    expect(beta.flags['flag.summarize-model-targeted']).toMatchObject({
      enabled: true,
      value: 'quality',
      valueType: 'string_enum',
    });

    // Same flag, same environment, same user key - only the attributes differ.
    // The browser receives the string the edge chose for THIS user and no way to
    // discover the other one.
    const free = await flagsFor({ plan: 'free' });
    expect(free.flags['flag.summarize-model-targeted']).toMatchObject({
      enabled: false,
      // config.fallback, not the flag's own 'balanced': off is a real kill for
      // typed flags too.
      value: 'fast',
      valueType: 'string_enum',
    });
    // A boolean flag in the same payload still reports value === enabled.
    expect(free.flags['flag.v1-shaped']).toMatchObject({
      enabled: true,
      value: true,
      valueType: 'boolean',
    });

    // The leak a typed flag can have that a boolean flag cannot: the string an
    // off flag would have served must not appear anywhere in the body - not as
    // `value`, not riding along in some other field.
    expect(free.text).not.toContain('Never seen while off.');
    expect(free.flags['flag.banner-copy-off']).toMatchObject({
      enabled: false,
      value: 'Scheduled maintenance tonight.',
    });
  });

  it('never ships targeting rules or segments to the browser', async () => {
    const res = await call(
      `/v1/flags?environment=${TARGETING_ENV}&user=alice&attributes=${encodeURIComponent('{"plan":"pro"}')}`,
      authed(CLIENT_KEY),
    );
    const text = await res.text();
    // JSON property forms - a tool KEY may legitimately contain these words.
    expect(text).not.toContain('"targetingRules"');
    expect(text).not.toContain('"segments"');
    expect(text).not.toContain('"conditions"');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('validates parameters', async () => {
    const noUser = await call(`/v1/flags?environment=${TARGETING_ENV}`, authed(CLIENT_KEY));
    expect(noUser.status).toBe(400);
    const badAttributes = await call(
      `/v1/flags?environment=${TARGETING_ENV}&user=alice&attributes=not-json`,
      authed(CLIENT_KEY),
    );
    expect(badAttributes.status).toBe(400);
  });
});

describe('CORS', () => {
  it('answers preflight with permissive read-only CORS', async () => {
    const res = await call('/v1/flags', { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('sets CORS headers on data and error responses alike', async () => {
    const ok = await call(`/v1/flags?environment=${TARGETING_ENV}&user=alice`, authed(CLIENT_KEY));
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
    const unauthorized = await call(`/v1/flags?environment=${TARGETING_ENV}&user=alice`);
    expect(unauthorized.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects writes - the API is read-only', async () => {
    const res = await call(`/v1/ruleset?environment=${TARGETING_ENV}`, {
      method: 'POST',
      ...authed(SERVER_KEY),
    });
    expect(res.status).toBe(405);
  });
});
