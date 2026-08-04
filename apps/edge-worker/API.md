# ToggleFlow Delivery API — v1

The delivery API is ToggleFlow's public, read-only REST interface — the same endpoints our SDKs consume. Anything an SDK can do, you can do with plain HTTP: the JS SDK is a convenience, never a requirement. It is served from Cloudflare's edge and keeps answering even when the ToggleFlow control plane is completely down.

## Stability promise

- `/v1/*` routes, their parameters, response shapes, and error codes are **stable**: we will not remove or rename fields, change types, or alter status-code semantics within v1. Changes are additive only (new optional fields, new endpoints). Breaking changes get a new path prefix (`/v2/...`) with a deprecation window for v1.
- The ruleset snapshot body carries its own `schemaVersion` (currently `1`). Within a `schemaVersion`, new fields may appear on existing objects — they are always optional and always have a default that means "what this snapshot meant before the field existed", so a reader that ignores them stays correct. A change to what an _existing_ field means ships under a bumped `schemaVersion`, never silently.
- Caching/change-detection is contract, not implementation detail: `ETag` on `/v1/ruleset` changes **if and only if** the published content changes.

## Authentication

Every request needs an environment-scoped API key (created in the dashboard or via the management API) as a bearer token:

```
Authorization: Bearer tf_srv_...   # server key — secret, backend only
Authorization: Bearer tf_cli_...   # client key — safe to expose in browsers
```

| Endpoint          | server key | client key                                |
| ----------------- | ---------- | ----------------------------------------- |
| `GET /v1/ruleset` | ✅         | ❌ (targeting rules never reach browsers) |
| `GET /v1/flags`   | ✅         | ✅                                        |

A missing/invalid key and an unknown environment both return `401` — key validation happens entirely at the edge.

## `GET /v1/ruleset`

The full published ruleset snapshot for one environment. This is what server-side callers cache in memory and evaluate locally (kill-switch/boolean state is directly readable; %-rollout bucketing needs the documented hash — use an SDK or see the engine notes).

**Query parameters**

| Name          | Required | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `environment` | yes      | The environment id (dashboard → environment settings). |

**Headers**

| Name            | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `If-None-Match` | Previous `ETag`; returns `304 Not Modified` when unchanged. |

**Responses**

- `200` — snapshot JSON (`schemaVersion`, `projectId`, `environmentId`, `environmentKey`, `version`, `publishedAt`, `segments`, `tools`). Each `tools` entry carries `enabled`, `rolloutPercent`, `targetingRules`, `config`, `valueType` and `value` (see [Typed values](#typed-values)). Treat `valueType` as optional when reading: absent means `boolean`, because a snapshot published before typed flags existed does not carry it. Current publishes always include both fields. Headers: `ETag` (content hash), `X-Ruleset-Version`, `Cache-Control: no-cache`.
- `304` — unchanged (empty body).
- `400 missing_parameter` · `401 unauthorized` · `404 ruleset_not_published`.

**Polling contract:** poll with `If-None-Match` at ~30s; unchanged rulesets cost a header-only `304`. Keep serving your last snapshot on any error (stale-if-error) — that is exactly what the official SDKs do.

```bash
curl -H "Authorization: Bearer $TOGGLEFLOW_SERVER_KEY" \
     -H "If-None-Match: \"$LAST_ETAG\"" \
     "https://edge.toggleflow.example/v1/ruleset?environment=$ENV_ID"
```

## `GET /v1/flags`

Already-evaluated flags for **one user** — the browser endpoint. Evaluation happens at the edge; targeting rules and segments never leave it, and the payload stays small even at hundreds of tools.

**Query parameters**

| Name          | Required | Description                                                                                                                         |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `environment` | yes      | The environment id.                                                                                                                 |
| `user`        | yes      | Stable user key — drives deterministic % rollouts.                                                                                  |
| `attributes`  | no       | URL-encoded JSON object of targeting attributes, e.g. `{"plan":"pro","region":"eu"}`. Values must be strings, numbers, or booleans. |

**Responses**

- `200` — `{ environmentId, environmentKey, version, flags }` where `flags` maps each tool key to `{ enabled, value, valueType, config, fallback }`. `config` is the tool's live config value (or `null`); `fallback` is what to show/serve when `enabled` is `false`; `value`/`valueType` are described below. Header: `Cache-Control: no-store` (per-user payload).
- `400 missing_parameter | invalid_parameter` · `401 unauthorized` · `404 ruleset_not_published`.

Which rule produced a result is deliberately **not** in the response: rules and segments stay at the edge, so the browser learns what to serve and nothing about who else gets what.

```bash
curl -H "Authorization: Bearer $TOGGLEFLOW_CLIENT_KEY" \
     "https://edge.toggleflow.example/v1/flags?environment=$ENV_ID&user=user-42&attributes=%7B%22plan%22%3A%22pro%22%7D"
```

```json
{
  "environmentId": "env_...",
  "environmentKey": "production",
  "version": 12,
  "flags": {
    "flag.new-editor": {
      "enabled": true,
      "value": true,
      "valueType": "boolean",
      "config": null,
      "fallback": null
    },
    "flag.summarize-model": {
      "enabled": true,
      "value": "quality",
      "valueType": "string_enum",
      "config": { "fallback": "fast" },
      "fallback": "fast"
    }
  }
}
```

### Typed values

A flag has an on/off gate and, for non-boolean types, a value it serves while on. Both are always present, for every type:

- **`enabled` is the gate for every type.** It answers "is this flag on for this user" — a kill switch, a matching targeting rule with `enabled: false`, and being bucketed out of a `%` rollout all report `false`, whatever the flag's type is. Read it exactly as you did before typed values existed; its meaning has not changed.
- **`value` is what to serve.** For a `boolean` flag it _is_ `enabled`, so the two fields can never disagree. For a `string` or `string_enum` flag it is the resolved string while on, and the flag's `config.fallback` while off (`null` when none is configured) — an off string flag never returns the string it would have served, so switching a flag off is a real kill for typed flags too.
- **`valueType` is echoed** — `boolean`, `string`, or `string_enum` — so you can narrow `value` without a second call to `/v1/ruleset`. A snapshot published before typed flags existed reports `boolean`, which is what it meant.

New value types are additive: treat `valueType` as an open set and `value` as JSON of unknown shape. **Fall back to your own default whenever `value` is not the runtime type you expect** — a flag someone retyped in the dashboard, or a key you asked for that no longer exists, should degrade to your default rather than break your render. That is precisely what the SDK accessors (`getStringValue(…, default)`, `getBooleanValue(…, default)`) do for you — their default argument is required for exactly this reason.

## Errors

All errors are JSON: `{ "error": "<machine_code>", "message": "<human text>" }`. The API is read-only — any non-GET request (except CORS preflight) returns `405 method_not_allowed`.

## CORS

Browser-friendly: `Access-Control-Allow-Origin: *` on all responses, preflight handled, `ETag`/`X-Ruleset-Version` exposed. Client keys are designed to be public; protect **server** keys like passwords.
