import killSwitchFixture from '@toggleflow/engine/fixtures/kill-switch.json';
import { afterAll, describe, expect, it } from 'vitest';

import {
  expressToolGuard,
  fastifyToolGuard,
  matchRoute,
  resolveDisabledResponse,
} from '../src/middleware';
import { createServerClient } from '../src/server';
import { createFakeFetch, notModified } from './fake-fetch';

// tool.translate is kill-switched with fallback {mode:'message', message:...};
// tool.summarize is enabled.
const fake = createFakeFetch(notModified);
const client = createServerClient({
  edgeUrl: 'http://edge.test',
  environmentId: 'env-prod',
  serverKey: 'tf_srv_test',
  bootstrap: killSwitchFixture.snapshot,
  fetch: fake.fetch,
});
afterAll(() => client.close());

const routes = [
  { path: '/api/translate', tool: 'tool.translate' },
  { path: '/api/summarize', tool: 'tool.summarize' },
  { path: /^\/regex\/\d+$/, tool: 'tool.translate' },
  { path: '/api/post-only', methods: ['POST'], tool: 'tool.translate' },
];

interface Sent {
  status?: number;
  body?: unknown;
}

const expressRes = (sent: Sent) => ({
  status(code: number) {
    sent.status = code;
    return {
      json(body: unknown) {
        sent.body = body;
      },
    };
  },
});

describe('matchRoute', () => {
  it('matches string prefixes, regexes, and method filters', () => {
    expect(matchRoute(routes, { method: 'GET', path: '/api/translate/fr' })).toBe('tool.translate');
    expect(matchRoute(routes, { method: 'GET', url: '/api/summarize?x=1' })).toBe('tool.summarize');
    expect(matchRoute(routes, { method: 'GET', path: '/regex/42' })).toBe('tool.translate');
    expect(matchRoute(routes, { method: 'GET', path: '/regex/nope' })).toBeNull();
    expect(matchRoute(routes, { method: 'GET', path: '/api/post-only' })).toBeNull();
    expect(matchRoute(routes, { method: 'post', path: '/api/post-only' })).toBe('tool.translate');
    expect(matchRoute(routes, { method: 'GET', path: '/unrelated' })).toBeNull();
  });
});

describe('expressToolGuard', () => {
  const guard = expressToolGuard({ client, routes });

  it('answers disabled tools with the configured fallback — zero per-tool code', () => {
    const sent: Sent = {};
    let nextCalled = false;
    guard({ method: 'POST', path: '/api/translate' }, expressRes(sent), () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(false);
    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({
      error: 'tool_disabled',
      tool: 'tool.translate',
      message: 'Translate is temporarily unavailable.',
    });
  });

  it('passes enabled tools and unmatched routes through', () => {
    for (const path of ['/api/summarize', '/somewhere/else']) {
      const sent: Sent = {};
      let nextCalled = false;
      guard({ method: 'GET', path }, expressRes(sent), () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      expect(sent.status).toBeUndefined();
    }
  });
});

describe('fastifyToolGuard', () => {
  const guard = fastifyToolGuard({ client, routes });

  it('short-circuits disabled tools via reply', async () => {
    const sent: Sent = {};
    await guard(
      { method: 'GET', url: '/api/translate?lang=fr' },
      {
        code(status: number) {
          sent.status = status;
          return {
            send(body: unknown) {
              sent.body = body;
            },
          };
        },
      },
    );
    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ tool: 'tool.translate' });
  });

  it('does nothing for enabled tools', async () => {
    const sent: Sent = {};
    await guard(
      { method: 'GET', url: '/api/summarize' },
      {
        code(status: number) {
          sent.status = status;
          return { send() {} };
        },
      },
    );
    expect(sent.status).toBeUndefined();
  });
});

describe('resolveDisabledResponse', () => {
  it('lets the fallback payload override status and message', () => {
    const { status, body } = resolveDisabledResponse({
      key: 'tool.x',
      enabled: false,
      reason: 'kill_switch',
      config: null,
      fallback: { status: 451, message: 'gone for legal reasons' },
    });
    expect(status).toBe(451);
    expect(body.message).toBe('gone for legal reasons');
  });

  it('defaults to 503 with a generic message when there is no fallback', () => {
    const { status, body } = resolveDisabledResponse({
      key: 'tool.x',
      enabled: false,
      reason: 'kill_switch',
      config: null,
      fallback: null,
    });
    expect(status).toBe(503);
    expect(body.message).toBe('This feature is temporarily unavailable.');
    expect(body.fallback).toBeUndefined();
  });
});
