/**
 * Route→flag middleware (roadmap decision 1.2): map routes to tools once and
 * every matched route is guarded — zero per-tool code. A disabled tool
 * answers with its configured fallback (e.g. 503 + message) before your
 * handler ever runs. Framework adapters use structural types only — no
 * express/fastify dependency.
 */
import type { JsonObject, ToolEvaluation } from '@toggleflow/engine';

import { ANONYMOUS, type ToggleFlowServerClient, type UserContextInput } from './server';

export interface RouteFlagRule {
  /** String = path prefix ('/api/translate' matches '/api/translate/x'); RegExp = full test. */
  path: string | RegExp;
  /** Optional HTTP method filter (case-insensitive). Default: all methods. */
  methods?: string[];
  /** The tool key that guards this route. */
  tool: string;
}

export interface GuardRequest {
  method?: string;
  /** Express-style path, when available. */
  path?: string;
  /** Fallback: full URL (path is extracted). */
  url?: string;
}

export interface ToolGuardOptions {
  client: ToggleFlowServerClient;
  routes: RouteFlagRule[];
  /** Extract the user context (drives targeting/% rollouts). Default: anonymous. */
  user?: (req: GuardRequest) => UserContextInput;
}

export interface DisabledResponse {
  status: number;
  body: JsonObject;
}

function requestPath(req: GuardRequest): string {
  if (req.path) return req.path;
  const url = req.url ?? '/';
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

export function matchRoute(rules: RouteFlagRule[], req: GuardRequest): string | null {
  const path = requestPath(req);
  const method = (req.method ?? 'GET').toUpperCase();
  for (const rule of rules) {
    if (rule.methods && !rule.methods.map((m) => m.toUpperCase()).includes(method)) continue;
    const matches =
      typeof rule.path === 'string' ? path.startsWith(rule.path) : rule.path.test(path);
    if (matches) return rule.tool;
  }
  return null;
}

/**
 * The disabled answer, derived from the tool's configured fallback
 * (brief §6D): `fallback.status` overrides the 503, `fallback.message` the
 * human text; the whole fallback payload rides along for clients.
 */
export function resolveDisabledResponse(evaluation: ToolEvaluation): DisabledResponse {
  const fallback =
    evaluation.fallback !== null &&
    typeof evaluation.fallback === 'object' &&
    !Array.isArray(evaluation.fallback)
      ? evaluation.fallback
      : null;
  const status = typeof fallback?.status === 'number' ? fallback.status : 503;
  const message =
    typeof fallback?.message === 'string'
      ? fallback.message
      : 'This feature is temporarily unavailable.';
  const body: JsonObject = { error: 'tool_disabled', tool: evaluation.key, message };
  if (evaluation.fallback !== null) body.fallback = evaluation.fallback;
  return { status, body };
}

interface ExpressLikeResponse {
  status(code: number): { json(body: unknown): unknown };
}

/** Express/Connect middleware: `app.use(expressToolGuard({ client, routes }))`. */
export function expressToolGuard(
  options: ToolGuardOptions,
): (req: GuardRequest, res: ExpressLikeResponse, next: () => void) => void {
  return (req, res, next) => {
    const tool = matchRoute(options.routes, req);
    if (!tool) return next();
    const evaluation = options.client.evaluate(tool, options.user?.(req) ?? ANONYMOUS);
    if (evaluation.enabled) return next();
    const { status, body } = resolveDisabledResponse(evaluation);
    res.status(status).json(body);
  };
}

interface FastifyLikeReply {
  code(statusCode: number): { send(body: unknown): unknown };
}

/** Fastify onRequest hook: `app.addHook('onRequest', fastifyToolGuard({ client, routes }))`. */
export function fastifyToolGuard(
  options: ToolGuardOptions,
): (req: GuardRequest, reply: FastifyLikeReply) => Promise<void> {
  return async (req, reply) => {
    const tool = matchRoute(options.routes, req);
    if (!tool) return;
    const evaluation = options.client.evaluate(tool, options.user?.(req) ?? ANONYMOUS);
    if (evaluation.enabled) return;
    const { status, body } = resolveDisabledResponse(evaluation);
    reply.code(status).send(body);
  };
}
