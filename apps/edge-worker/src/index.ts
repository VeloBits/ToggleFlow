/**
 * ToggleFlow delivery plane - the public read API (see API.md).
 *
 * Serves published, versioned ruleset snapshots from KV at the edge. This
 * path is the product's uptime promise: it keeps serving the last published
 * snapshot even when the control plane is down. Read-only - it NEVER calls
 * the origin server or the database; even API-key auth runs off hashes the
 * control plane published to KV.
 */
import { evaluateAll, rulesetSnapshotSchema, userContextSchema } from '@toggleflow/engine';

import { authorize } from './auth';
import { CORS_HEADERS, errorResponse, etagMatches } from './http';

export interface Env {
  /** KV namespace holding published ruleset snapshots + API-key hashes (wrangler.jsonc). */
  RULESETS: KVNamespace;
}

interface RulesetMetadata {
  contentHash?: string;
  version?: number;
}

/**
 * Full snapshot for server SDKs. Server-key auth; strong ETag from the
 * published content hash, so unchanged rulesets poll as cheap 304s.
 */
async function handleRuleset(request: Request, env: Env, url: URL): Promise<Response> {
  const environmentId = url.searchParams.get('environment');
  if (!environmentId) {
    return errorResponse(400, 'missing_parameter', 'the `environment` query parameter is required');
  }
  if (!(await authorize(request, env.RULESETS, environmentId, ['server']))) {
    return errorResponse(
      401,
      'unauthorized',
      'a valid server key for this environment is required',
    );
  }

  const entry = await env.RULESETS.getWithMetadata<RulesetMetadata>(
    `ruleset:${environmentId}`,
    'text',
  );
  if (entry.value === null) {
    return errorResponse(
      404,
      'ruleset_not_published',
      'no ruleset has been published for this environment',
    );
  }

  const headers = new Headers({
    ...CORS_HEADERS,
    'content-type': 'application/json',
    'cache-control': 'no-cache',
  });
  const contentHash = entry.metadata?.contentHash;
  const etag = contentHash ? `"${contentHash}"` : null;
  if (etag) headers.set('etag', etag);
  if (entry.metadata?.version !== undefined) {
    headers.set('x-ruleset-version', String(entry.metadata.version));
  }

  if (etag && etagMatches(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(entry.value, { status: 200, headers });
}

/**
 * Already-evaluated flags for one user - the browser endpoint. Client-key
 * auth (server keys also accepted); evaluation happens HERE via the shared
 * engine, so targeting rules and segments never reach the browser and the
 * payload stays tiny even at fixmytext scale (254 tools).
 */
async function handleFlags(request: Request, env: Env, url: URL): Promise<Response> {
  const environmentId = url.searchParams.get('environment');
  if (!environmentId) {
    return errorResponse(400, 'missing_parameter', 'the `environment` query parameter is required');
  }
  const userKey = url.searchParams.get('user');
  if (!userKey) {
    return errorResponse(400, 'missing_parameter', 'the `user` query parameter is required');
  }
  let attributes: unknown = {};
  const rawAttributes = url.searchParams.get('attributes');
  if (rawAttributes) {
    try {
      attributes = JSON.parse(rawAttributes);
    } catch {
      return errorResponse(400, 'invalid_parameter', '`attributes` must be URL-encoded JSON');
    }
  }
  const context = userContextSchema.safeParse({ key: userKey, attributes });
  if (!context.success) {
    return errorResponse(400, 'invalid_parameter', 'invalid user context');
  }

  if (!(await authorize(request, env.RULESETS, environmentId, ['client', 'server']))) {
    return errorResponse(
      401,
      'unauthorized',
      'a valid client key for this environment is required',
    );
  }

  const raw = await env.RULESETS.get(`ruleset:${environmentId}`, 'text');
  if (raw === null) {
    return errorResponse(
      404,
      'ruleset_not_published',
      'no ruleset has been published for this environment',
    );
  }
  const snapshot = rulesetSnapshotSchema.safeParse(JSON.parse(raw));
  if (!snapshot.success) {
    return errorResponse(500, 'snapshot_invalid', 'the published snapshot failed validation');
  }

  const evaluations = evaluateAll(snapshot.data, context.data);
  const flags: Record<string, { enabled: boolean; config: unknown; fallback: unknown }> = {};
  for (const [key, evaluation] of Object.entries(evaluations)) {
    flags[key] = {
      enabled: evaluation.enabled,
      config: evaluation.config,
      fallback: evaluation.fallback,
    };
  }

  return Response.json(
    {
      environmentId: snapshot.data.environmentId,
      environmentKey: snapshot.data.environmentKey,
      version: snapshot.data.version,
      flags,
    },
    // Per-user payload: never shared-cache it.
    { headers: { ...CORS_HEADERS, 'cache-control': 'no-store' } },
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok' }, { headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'this API is read-only');
    }
    if (url.pathname === '/v1/ruleset') {
      return handleRuleset(request, env, url);
    }
    if (url.pathname === '/v1/flags') {
      return handleFlags(request, env, url);
    }
    return errorResponse(404, 'not_found', 'unknown route - see API.md');
  },
} satisfies ExportedHandler<Env>;
