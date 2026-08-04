/**
 * Shared harness for dashboard component tests.
 *
 * Deliberately stubs at the `fetch` boundary rather than mocking `../src/api`,
 * so src/api/client.ts (auth header, 204 handling, ApiError mapping) is
 * exercised by every page test instead of being replaced by a mock.
 *
 * oidc.ts is imported for real rather than vi.mock'd: constructing a
 * UserManager does no I/O, so spying on its methods (`stubAuth`) keeps that
 * module covered AND sidesteps vi.mock's hoisting rules, which would not apply
 * to a factory called from this file.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { User } from 'oidc-client-ts';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, vi, type MockInstance } from 'vitest';

import type { Environment, Flag, FlagDefinition, Me, Project } from '../src/api/client';
import { userManager } from '../src/auth/oidc';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { WorkspaceProvider } from '../src/state/WorkspaceContext';
import { ToastProvider } from '../src/ui/toast';

// ── fetch stubbing ────────────────────────────────────────────────────────────

export interface HandlerRequest {
  body: unknown;
  url: string;
}

/**
 * `"GET /v1/me"` -> a 200 body, a `{ status, body }` pair, or a function of the
 * request. The value stays `unknown`: a union with a bare `unknown` member
 * collapses to `unknown`, which would strip the parameter types off the
 * function form. `dynamic()` supplies those instead.
 */
export type Handlers = Record<string, unknown>;

/**
 * Wraps a request-dependent handler so its parameter is typed at the call site
 * (`dynamic(({ url }) => …)`).
 */
export const dynamic = (fn: (req: HandlerRequest) => unknown) => fn;

export interface FetchStub {
  /** Every request seen, in order, as `"METHOD /path"`. */
  calls: { key: string; body: unknown }[];
  /** Replace or add handlers mid-test (e.g. after a mutation changes the list). */
  set: (handlers: Handlers) => void;
}

const isStatusShape = (v: unknown): v is { status: number; body?: unknown } =>
  typeof v === 'object' && v !== null && 'status' in v;

/**
 * Installs a `fetch` that resolves the handler table. An unhandled route is a
 * test bug, not a 404 - it fails loudly so a renamed endpoint cannot silently
 * turn into an empty page.
 */
export function stubFetch(handlers: Handlers): FetchStub {
  let table = { ...handlers };
  const calls: { key: string; body: unknown }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const key = `${method} ${path}`;
      calls.push({ key, body });

      const handler = table[key] ?? table[`${method} ${path.split('?')[0]}`];
      if (handler === undefined) {
        throw new Error(
          `unhandled request: ${key}\nhandlers: ${Object.keys(table).join(', ') || '(none)'}`,
        );
      }

      /*
       * `await` so a handler may return a promise. That is what makes an
       * optimistic mutation testable: with an instantly-resolving stub the
       * window between the optimistic write and the server's answer is a single
       * microtask, which `waitFor` polls straight past - so a test could not
       * tell a real optimistic update from no update at all. A handler that
       * returns a deferred promise holds the request open for as long as the
       * assertion needs.
       */
      const resolved = await (typeof handler === 'function'
        ? handler({ body, url: path })
        : handler);
      if (isStatusShape(resolved)) {
        return new Response(resolved.body === undefined ? '' : JSON.stringify(resolved.body), {
          status: resolved.status,
        });
      }
      return new Response(JSON.stringify(resolved), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );

  return {
    calls,
    set: (next) => {
      table = { ...table, ...next };
    },
  };
}

/** Assert a request was made, and return its parsed body. */
export function requestBody(stub: FetchStub, key: string): unknown {
  const call = stub.calls.find((c) => c.key === key);
  expect(
    call,
    `no request matched ${key}; saw ${stub.calls.map((c) => c.key).join(', ')}`,
  ).toBeDefined();
  return call!.body;
}

// ── auth ──────────────────────────────────────────────────────────────────────

/** A signed-in user, minus every field the dashboard never reads. */
export const testUser = {
  access_token: 'test-token',
  expired: false,
  profile: { email: 'dev@velobits.test' },
} as unknown as User;

export interface AuthStub {
  getUser: MockInstance<typeof userManager.getUser>;
  signinRedirect: MockInstance<typeof userManager.signinRedirect>;
  signoutRedirect: MockInstance<typeof userManager.signoutRedirect>;
  signinRedirectCallback: MockInstance<typeof userManager.signinRedirectCallback>;
}

/**
 * Spies over the real UserManager. `user: null` models logged-out, which is how
 * getAccessToken's empty-string branch gets reached.
 */
export function stubAuth({ user = testUser }: { user?: User | null } = {}): AuthStub {
  return {
    getUser: vi.spyOn(userManager, 'getUser').mockResolvedValue(user),
    signinRedirect: vi.spyOn(userManager, 'signinRedirect').mockResolvedValue(undefined),
    signoutRedirect: vi.spyOn(userManager, 'signoutRedirect').mockResolvedValue(undefined),
    signinRedirectCallback: vi
      .spyOn(userManager, 'signinRedirectCallback')
      .mockResolvedValue(testUser),
  };
}

// ── fixtures ──────────────────────────────────────────────────────────────────

export const ORG_ID = '11111111-1111-4111-8111-111111111111';
export const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
/**
 * The environment the workspace selects by default, which page tests scope
 * their handlers to. It is the *production* one: WorkspaceProvider prefers the
 * `prod` environment over list order, so a fixture whose ENV_ID was `dev`
 * would leave every page fetching an id its handlers do not answer for.
 */
export const ENV_ID = '33333333-3333-4333-8333-333333333333';
/** The non-default environment, for switching and multi-env assertions. */
export const DEV_ENV_ID = '44444444-4444-4444-8444-444444444444';

export const me = (role: Me['orgs'][number]['role'] = 'admin'): Me => ({
  user: { id: 'u1', email: 'dev@velobits.test', displayName: 'Dev User' },
  orgs: [{ id: ORG_ID, name: 'VeloBits', role }],
});

export const project = (): Project => ({ id: PROJECT_ID, name: 'Control Plane' });

export const environments = (): Environment[] => [
  { id: ENV_ID, key: 'prod', name: 'Production' },
  { id: DEV_ENV_ID, key: 'dev', name: 'Development' },
];

/**
 * A flag row as `GET /v1/environments/:id/flags` sends it - server field names
 * and all.
 *
 * Overrides are written in the dashboard's vocabulary (`id`, `key`, `name`) and
 * translated into the server's here, for two reasons: no test has to know that
 * the API says `toolKey`, and api/client.ts's `toFlag` is exercised by every
 * page suite rather than bypassed. The return type is deliberately not `Flag` -
 * it is an HTTP body, and the point of this fixture is that the two differ.
 */
export const flagRow = ({
  id = 't1',
  key = 'tool.summarize',
  name = 'Summarize',
  ...over
}: Partial<Flag> = {}) => ({
  toolId: id,
  toolKey: key,
  toolName: name,
  archived: false,
  enabled: true,
  rolloutPercent: null,
  targetingRules: [],
  valueType: 'boolean',
  enumOptions: [],
  value: null,
  defaultValue: null,
  updatedAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

/**
 * A flag definition as `GET /v1/projects/:id/tools` sends it. No translation
 * needed: that endpoint already answers with `id` / `key` / `name`, which is why
 * only the list above has a wire shape of its own.
 */
export const flagDefinition = (over: Partial<FlagDefinition> = {}): FlagDefinition => ({
  id: 't1',
  key: 'tool.summarize',
  name: 'Summarize',
  description: null,
  tags: ['text'],
  metadata: {},
  archived: false,
  valueType: 'boolean',
  enumOptions: [],
  defaultValue: null,
  updatedAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

/** The three requests WorkspaceProvider always makes, so page tests only declare their own. */
export const workspaceHandlers = (role: Me['orgs'][number]['role'] = 'admin'): Handlers => ({
  'GET /v1/me': me(role),
  [`GET /v1/orgs/${ORG_ID}/projects`]: [project()],
  [`GET /v1/projects/${PROJECT_ID}/environments`]: environments(),
});

// ── rendering ─────────────────────────────────────────────────────────────────

/** Fresh QueryClient per render; retries off so an expected error surfaces at once. */
export function renderWithProviders(
  ui: ReactNode,
  { route = '/', withWorkspace = true }: { route?: string; withWorkspace?: boolean } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  const inner = withWorkspace ? <WorkspaceProvider>{ui}</WorkspaceProvider> : ui;

  /*
   * The provider stack mirrors src/main.tsx, TooltipProvider included: shadcn's
   * `Tooltip` is a bare Radix Root and throws "must be used within
   * TooltipProvider" at render time. Leaving it out here would mean any
   * component that grows a tooltip breaks its suite for a reason that has
   * nothing to do with the test.
   */
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>{inner}</ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
