/**
 * Thin typed fetch wrapper over the control-plane API (proxied at /api in dev),
 * and the one place where the server's vocabulary is translated into the
 * dashboard's.
 *
 * ## The boundary rule
 *
 * The control plane still calls a flag definition a "tool": the routes are
 * `/v1/projects/:id/tools`, `/v1/tools/:id` and
 * `PATCH /v1/environments/:eid/tools/:tid/flag`, and the flag list answers with
 * `toolId` / `toolKey` / `toolName`. Renaming that is a database migration and a
 * breaking API change; renaming it in the UI is a find-and-replace. So the two
 * names are allowed to disagree, and this directory is where they are
 * reconciled.
 *
 * **No server field name may appear above `src/api/`.** Nothing outside this
 * directory may mention `toolId`, `toolKey`, `toolName` or the `Tool` type -
 * pages see `Flag`, `FlagDefinition`, `FlagConfig` and their `id` / `key` /
 * `name` fields. When the API is eventually renamed, `toFlag` below becomes the
 * identity function and not one page changes.
 *
 * URL paths are the exception, and only because moving every mutation into this
 * layer is a bigger change than this one: the query layer (api/flags.ts) owns
 * the GET paths, while the pages still build their own PATCH/PUT paths.
 */
import type { FlagValueType, JsonValue } from '@toggleflow/engine';

import { getAccessToken } from '../auth/AuthContext';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const payload = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      payload?.error ?? 'request_failed',
      payload?.message ?? `HTTP ${res.status}`,
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// ── API types (mirrors the control-plane responses) ───────────────────────────

export type Role = 'admin' | 'developer' | 'viewer';

export interface Org {
  id: string;
  name: string;
  role: Role;
}

export interface Me {
  user: { id: string; email: string; displayName: string | null };
  orgs: Org[];
}

export interface Environment {
  id: string;
  key: string;
  name: string;
}

/** One resource class copied by environment inheritance, as reported by the API. */
export interface CopiedResource {
  key: string;
  /** Server-supplied, plural and lowercase ("flag states") - rendered as-is, so
   *  a resource added to the API's registry needs no dashboard change. */
  label: string;
  count: number;
}

/** POST /v1/projects/:id/environments - the environment plus what it inherited. */
export interface CreatedEnvironment extends Environment {
  inheritedFrom: Environment | null;
  copied: CopiedResource[];
}

export interface CreateEnvironmentInput {
  key: string;
  name: string;
  /** null = blank environment. */
  inheritFromEnvironmentId: string | null;
}

export interface Project {
  id: string;
  name: string;
  environments?: Environment[];
}

/**
 * A flag as defined once per project: its key, its type, and the constraints
 * that type carries. `GET /v1/projects/:projectId/tools` answers with a list of
 * these - and answers with `id` / `key` / `name` already, so no mapping is
 * needed here, only the type's name.
 */
export interface FlagDefinition {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  archived: boolean;
  /** Which of `FLAG_VALUE_TYPES` this flag serves. */
  valueType: FlagValueType;
  /** Allowed members for `string_enum`; empty for every other type. */
  enumOptions: string[];
  /** Served when an environment has no value of its own. */
  defaultValue: JsonValue | null;
  updatedAt: string;
}

/** One environment's state for a flag, as `GET /v1/tools/:flagId` reports it. */
export interface FlagState {
  environmentId: string;
  environmentKey: string;
  enabled: boolean;
  /** The environment's own value; null = inherit `defaultValue`. */
  value: JsonValue | null;
  rolloutPercent: number | null;
  targetingRules: unknown[];
  updatedAt: string;
}

/**
 * `GET /v1/tools/:flagId` - the definition plus every environment's state, which
 * is what the detail page needs to show one flag across the whole project.
 */
export interface FlagDefinitionDetail extends FlagDefinition {
  flagStates: FlagState[];
}

/**
 * Wire shape of `GET /v1/environments/:environmentId/flags` — server names,
 * private to this file. `toFlag` is the only thing that reads it.
 */
interface FlagRowWire {
  toolId: string;
  toolKey: string;
  toolName: string;
  archived: boolean;
  enabled: boolean;
  rolloutPercent: number | null;
  targetingRules: unknown[];
  valueType: FlagValueType;
  enumOptions: string[];
  value: JsonValue | null;
  defaultValue: JsonValue | null;
  updatedAt: string;
}

/**
 * The dashboard's flag row: one flag as it stands in one environment.
 *
 * `id` is the tool id the API addresses - the same id that goes into
 * `/v1/tools/:id` and `/v1/environments/:eid/tools/:id/flag`, so a page never
 * needs to know that the server spells it `toolId`.
 */
export interface Flag {
  id: string;
  key: string;
  name: string;
  archived: boolean;
  enabled: boolean;
  rolloutPercent: number | null;
  targetingRules: unknown[];
  valueType: FlagValueType;
  enumOptions: string[];
  /** This environment's value; null = inherit `defaultValue`. */
  value: JsonValue | null;
  defaultValue: JsonValue | null;
  updatedAt: string;
}

const toFlag = ({ toolId, toolKey, toolName, ...rest }: FlagRowWire): Flag => ({
  id: toolId,
  key: toolKey,
  name: toolName,
  ...rest,
});

/**
 * The flag list for one environment, in the dashboard's vocabulary.
 *
 * Lives here rather than in api/flags.ts because `FlagRowWire` does: a fetch
 * typed against the wire shape is the last place the server's names are legal.
 */
export const fetchFlags = (environmentId: string): Promise<Flag[]> =>
  api
    .get<FlagRowWire[]>(`/v1/environments/${environmentId}/flags`)
    .then((rows) => rows.map(toFlag));

export interface Segment {
  id: string;
  key: string;
  name: string;
  description: string | null;
  rules: unknown[];
}

/** The JSON blob a flag carries per environment, versioned server-side. */
export interface FlagConfig {
  value: Record<string, unknown> | null;
  version: number;
  updatedAt?: string;
}

export interface ConfigVersion {
  id: string;
  version: number;
  value: Record<string, unknown>;
  authorId: string | null;
  restoredFromVersion: number | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  environmentId: string;
  kind: 'server' | 'client';
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
  /** Present only in the creation response - shown exactly once. */
  token?: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  email: string;
  displayName: string | null;
  role: Role;
  createdAt: string;
}
