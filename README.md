# ToggleFlow

**VeloBits Control Plane** (working name) — a remote control plane for applications: register your tools/features once, then toggle them, roll them out gradually, and edit their configuration live from a dashboard — no redeploy.

> **Status:** project scaffold only. Monorepo, toolchain, and CI are wired; no features implemented yet.

## Workspace layout

pnpm monorepo orchestrated by Turborepo. TypeScript everywhere — the evaluation engine is written once and shared by the API, the SDK, and the edge worker.

| Workspace          | Package                   | What it is                                                       |
| ------------------ | ------------------------- | ---------------------------------------------------------------- |
| `apps/api`         | `@toggleflow/api`         | Control-plane API — Fastify + Drizzle ORM + PostgreSQL           |
| `apps/dashboard`   | `@toggleflow/dashboard`   | Customer dashboard — React + Vite                                |
| `apps/edge-worker` | `@toggleflow/edge-worker` | Delivery plane — Cloudflare Worker + KV; the always-up read path |
| `packages/engine`  | `@toggleflow/engine`      | Shared flag/config evaluation engine (runtime-agnostic)          |
| `packages/sdk-js`  | `@toggleflow/sdk`         | JS/TS client SDK for customer apps                               |

The delivery plane's read endpoints are ToggleFlow's **public REST API** (what the SDKs consume — usable with plain HTTP from any language): see [apps/edge-worker/API.md](apps/edge-worker/API.md).

## Prerequisites

- Node ≥ 22 (see `.nvmrc`), pnpm 11 (`corepack enable`)
- Docker (ToggleFlow's own Postgres; auth comes from the shared velobits-infra stack)

## Quickstart

```bash
pnpm install
cp .env.example .env
docker compose up -d          # ToggleFlow's Postgres on localhost:5434
pnpm dev                      # all workspaces in watch mode (turbo)
```

- API: http://localhost:4000/health
- Dashboard: http://localhost:5173
- Edge worker: `wrangler dev` inside `apps/edge-worker` (needs a KV namespace id in `wrangler.jsonc` for deploys)

## Dev infrastructure

ToggleFlow is independent of the fixmytext repos — it runs its own database and reuses only org-level infra:

- **Database** — own Postgres container (`docker compose up -d`, host port **5434**; 5433 is taken by the fixmytext stack's dev DB).
- **Auth** — the shared `keycloak-dev` from the velobits-infra stack (org-level infra; `docker compose up -d` there) → http://localhost:8080 from the host, `http://keycloak-dev:8080` in-network.
- When a ToggleFlow service is containerized later, it joins the shared `velobits-net` network as `external: true` (see the velobits-infra compose header for the pattern).

## Scripts (repo root)

| Command          | What it does                             |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Watch mode across all workspaces         |
| `pnpm build`     | Build all workspaces (turbo, cached)     |
| `pnpm typecheck` | `tsc --noEmit` in every workspace        |
| `pnpm test`      | Vitest across workspaces                 |
| `pnpm lint`      | ESLint (single flat config at repo root) |
| `pnpm format`    | Prettier write                           |

Database (from `apps/api`): `pnpm db:generate` (emit SQL migrations from the Drizzle schema), `pnpm db:migrate`, `pnpm db:studio`. Migrations in `apps/api/drizzle/` are committed.

## Architecture in one paragraph

Two planes with opposite needs. The **control plane** (`api` + `dashboard`) is a normal CRUD app where customers edit flags and config — downtime is survivable. The **delivery plane** (`edge-worker`) is the read path customer SDKs consume: a dumb, cacheable, versioned-snapshot layer on Cloudflare's edge that keeps serving the last published ruleset even if the control plane dies. It never touches the origin server or the database. Backend SDK checks are authoritative; frontend checks are cosmetic.
