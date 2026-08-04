/**
 * @toggleflow/sdk - the JS/TS client SDK.
 *
 *  - Server client (secret key): boot-fetches the full ruleset, caches it in
 *    memory, evaluates locally via @toggleflow/engine (~0ms per check),
 *    ETag-polls in the background, and serves stale on any outage.
 *  - Browser client (client key): fetches already-evaluated flags from the
 *    edge - targeting rules never ship to the browser.
 *  - Route→flag middleware for Express/Fastify: zero per-tool code.
 *  - React adapter lives behind the `@toggleflow/sdk/react` subpath.
 *
 * Updates arrive through a transport-agnostic subscribe interface - SSE will
 * replace polling later without breaking changes (brief §8).
 */
export {
  ANONYMOUS,
  ToggleFlowServerClient,
  createServerClient,
  type ServerClientOptions,
  type ServerUpdate,
  type UserContextInput,
} from './server';

export {
  ToggleFlowBrowserClient,
  createBrowserClient,
  type BrowserClientOptions,
  type EvaluatedFlag,
  type FlagsSnapshot,
} from './browser';

export {
  expressToolGuard,
  fastifyToolGuard,
  matchRoute,
  resolveDisabledResponse,
  type DisabledResponse,
  type GuardRequest,
  type RouteFlagRule,
  type ToolGuardOptions,
} from './middleware';

export type { Unsubscribe } from './transport';

// The wire/evaluation types customers see in results. `FlagValueType` and the
// runtime `FLAG_VALUE_TYPES` come along because `EvaluatedFlag.valueType` and
// `ToolEvaluation.valueType` are typed by them - a customer narrowing on a
// flag's type should not have to depend on @toggleflow/engine directly.
export { FLAG_VALUE_TYPES } from '@toggleflow/engine';
export type {
  FlagValueType,
  JsonObject,
  JsonValue,
  RulesetSnapshot,
  ToolEvaluation,
  UserContext,
} from '@toggleflow/engine';
