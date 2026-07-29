# ToggleFlow

**VeloBits Control Plane** (working name) — a remote control plane for applications: register your tools/features once, then toggle them, roll them out gradually, and edit their configuration live from a dashboard — no redeploy.

> **Status:** project scaffold only. Monorepo, toolchain, and CI are wired; no features implemented yet.

## Workspace layout

npm-workspaces monorepo orchestrated by Turborepo. TypeScript everywhere — the evaluation engine is written once and shared by the API, the SDK, and the edge worker.

| Workspace          | Package                   | What it is                                                       |
| ------------------ | ------------------------- | ---------------------------------------------------------------- |
| `apps/api`         | `@toggleflow/api`         | Control-plane API — Fastify + Drizzle ORM + PostgreSQL           |
| `apps/dashboard`   | `@toggleflow/dashboard`   | Customer dashboard — React + Vite                                |
| `apps/edge-worker` | `@toggleflow/edge-worker` | Delivery plane — Cloudflare Worker + KV; the always-up read path |
| `packages/engine`  | `@toggleflow/engine`      | Shared flag/config evaluation engine (runtime-agnostic)          |
| `packages/sdk-js`  | `@toggleflow/sdk`         | JS/TS client SDK for customer apps                               |

The delivery plane's read endpoints are ToggleFlow's **public REST API** (what the SDKs consume — usable with plain HTTP from any language): see [apps/edge-worker/API.md](apps/edge-worker/API.md).

## Prerequisites

- Node ≥ 22 (see `.nvmrc`), npm ≥ 10 (ships with Node) — bare-metal only
- Docker Desktop
- **Start `../velobits-infra` first** — it owns the shared Keycloak and creates the `velobits-net` network this stack joins:
  ```bash
  cd ../velobits-infra && docker compose up -d
  ```

## Quickstart

Two ways to run. Both serve the same code; pick one.

### Everything in Docker (recommended)

```bash
docker compose --profile dev up --build
```

Then open **http://localhost:3200** — one origin for the whole stack.

### Bare metal

```bash
npm install
cp .env.example .env
docker compose --profile dev up -d postgres   # just the database, on localhost:5434
npm run dev                                   # all workspaces in watch mode (turbo)
```

- API: http://localhost:4000/health
- Dashboard: http://localhost:5173
- Edge worker: `npm run dev -w @toggleflow/edge-worker` (wrangler dev, port 8787)

## Docker

One compose file, three profiles. Every service belongs to a profile, so a bare `docker compose up` starts nothing.

| Command                                           | What it does                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `docker compose --profile dev up --build`         | Hot-reloading stack: tsx watch, vite, wrangler dev, source bind-mounted |
| `docker compose --profile prod up --build`        | Built artifacts: API on node, dashboard as static assets on nginx       |
| `docker compose --profile tools run --rm migrate` | Apply migrations (idempotent)                                           |
| `docker compose --profile tools run --rm seed`    | Seed demo data (idempotent)                                             |
| `docker compose --profile dev down`               | Stop. Add `-v` to also drop the database and KV volumes                 |

The **`dev` and `prod` profiles cannot run at the same time** — both routers publish host `:3200`.

### Routing

Everything enters through an nginx router. This is not decoration: [apps/dashboard/src/api/client.ts](apps/dashboard/src/api/client.ts) hardcodes `fetch('/api' + path)` with no configurable base URL, so the SPA must be served same-origin with something that strips `/api`.

| URL                             | Goes to                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `http://localhost:3200/`        | Dashboard (Vite dev server, or static nginx in prod)                |
| `http://localhost:3200/api/*`   | Control-plane API, `/api` stripped — e.g. `/api/health` → `/health` |
| `http://localhost:3200/edge/*`  | Edge worker, `/edge` stripped (**dev profile only**)                |
| `http://localhost:3200/healthz` | The router's own liveness probe                                     |

The edge worker has no prod container on purpose: production is `npm run deploy -w @toggleflow/edge-worker` to Cloudflare, so a local prod container would simulate nothing.

### Port map

Ports are shared across the VeloBits dev stacks — don't collide.

| Port               | Owner                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| 3200               | ToggleFlow router                                                                      |
| 4000 / 5173 / 8787 | ToggleFlow api / dashboard / edge worker (dev profile, published for direct debugging) |
| 5434               | ToggleFlow Postgres (5433 is the fixmytext dev DB)                                     |
| 80, 8080           | velobits-infra traefik, Keycloak                                                       |
| 3000, 3100–3103    | fixmytext-web-frontend                                                                 |

### The Keycloak issuer split

velobits-infra pins `KC_HOSTNAME=localhost`, so every token's `iss` is `http://localhost:8080/realms/Velobits` no matter which Host header the request carried — and that address is unreachable from inside a container. The API therefore takes two variables:

- `KEYCLOAK_URL` — the **issuer**, compared against `iss`. Stays `http://localhost:8080`.
- `KEYCLOAK_INTERNAL_URL` — the base for the **JWKS fetch** only. Set to `http://keycloak-dev:8080` in containers, unset on bare metal.

Keycloak's `toggleflow-dashboard` client needs `http://localhost:3200/*` in its valid redirect URIs and `http://localhost:3200` in its web origins.

### Docker layout

```
docker/
├── Dockerfile.node             # shared: all dev services + the migrate/seed one-shots
├── Dockerfile.api.prod         # multi-stage → node runtime
├── Dockerfile.dashboard.prod   # multi-stage → nginx-unprivileged
├── Dockerfile.router           # ARG NGINX_CONF picks dev vs prod
├── nginx.router.dev.conf
├── nginx.router.prod.conf
└── nginx.static.conf           # baked into the dashboard prod image
```

Three things worth knowing before changing any of it:

- **Every Node image is `bookworm-slim`, never alpine.** Two workspaces spawn `workerd`, which Cloudflare ships glibc-linked: `apps/edge-worker` via `wrangler dev`, and `apps/api` via `miniflare` — a _runtime_ dependency, imported whenever `KV_MODE=miniflare` (the default).
- **The `engine-dev` service is load-bearing.** `packages/engine` resolves through its `exports` to `dist/`, which is gitignored _and_ `.dockerignore`d, so nothing else creates it. That service builds it, then watches; every app gates on its healthcheck.
- **The miniflare KV store is a named volume, not a bind mount.** `apps/api` writes it and the edge worker reads it — two workerd processes over one SQLite store. On a Windows bind mount that reliably produces `SQLITE_BUSY`. Reset it with `docker volume rm toggleflow_wrangler-state`.

## Dev infrastructure

ToggleFlow is independent of the fixmytext repos — it runs its own database and reuses only org-level infra:

- **Database** — own Postgres container (host port **5434**; 5433 is taken by the fixmytext stack's dev DB).
- **Auth** — the shared `keycloak-dev` from the velobits-infra stack → http://localhost:8080 from the host, `http://keycloak-dev:8080` in-network.
- Containerized ToggleFlow services join the shared `velobits-net` network as `external: true`; any service that declares `networks:` must re-list `default` too, or it loses intra-stack DNS.

## Scripts (repo root)

| Command             | What it does                             |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Watch mode across all workspaces         |
| `npm run build`     | Build all workspaces (turbo, cached)     |
| `npm run typecheck` | `tsc --noEmit` in every workspace        |
| `npm test`          | Vitest across workspaces                 |
| `npm run lint`      | ESLint (single flat config at repo root) |
| `npm run format`    | Prettier write                           |

Run a single workspace's script with `npm run <script> -w @toggleflow/<name>`.

Database (from `apps/api`): `npm run db:generate` (emit SQL migrations from the Drizzle schema), `npm run db:migrate`, `npm run db:studio`. Migrations in `apps/api/drizzle/` are committed.

## Architecture in one paragraph

Two planes with opposite needs. The **control plane** (`api` + `dashboard`) is a normal CRUD app where customers edit flags and config — downtime is survivable. The **delivery plane** (`edge-worker`) is the read path customer SDKs consume: a dumb, cacheable, versioned-snapshot layer on Cloudflare's edge that keeps serving the last published ruleset even if the control plane dies. It never touches the origin server or the database. Backend SDK checks are authoritative; frontend checks are cosmetic.
