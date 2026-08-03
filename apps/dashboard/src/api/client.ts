/** Thin typed fetch wrapper over the control-plane API (proxied at /api in dev). */
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

export interface Tool {
  id: string;
  key: string;
  name: string;
  description: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  archived: boolean;
  updatedAt: string;
}

export interface FlagRow {
  toolId: string;
  toolKey: string;
  toolName: string;
  archived: boolean;
  enabled: boolean;
  rolloutPercent: number | null;
  targetingRules: unknown[];
  updatedAt: string;
}

export interface Segment {
  id: string;
  key: string;
  name: string;
  description: string | null;
  rules: unknown[];
}

export interface ToolConfig {
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
