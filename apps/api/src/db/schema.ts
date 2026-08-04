/**
 * Drizzle schema for the control plane.
 *
 * Tenancy: org → project → environment. Tools + segments are project-scoped;
 * flag state, config, ruleset snapshots, and API keys are per-environment.
 * `npm run db:generate` emits SQL migrations into ./drizzle (committed).
 */
import { FLAG_VALUE_TYPES, type JsonValue } from '@toggleflow/engine';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const membershipRole = pgEnum('membership_role', ['admin', 'developer', 'viewer']);
export const apiKeyKind = pgEnum('api_key_kind', ['server', 'client']);
/**
 * Generated from the engine's `FLAG_VALUE_TYPES`, so the DB enum, the wire enum
 * and the TS union can never drift: adding a type is one append there, and
 * drizzle-kit emits the `ALTER TYPE … ADD VALUE` from this declaration.
 */
export const flagValueType = pgEnum('flag_value_type', FLAG_VALUE_TYPES);

// ── Tenancy ───────────────────────────────────────────────────────────────────

export const orgs = pgTable('orgs', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Provisioned on first login from the Keycloak token; `keycloak_sub` is the identity link. */
export const users = pgTable(
  'users',
  {
    id: id(),
    keycloakSub: text('keycloak_sub').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_keycloak_sub_unique').on(t.keycloakSub)],
);

export const orgMemberships = pgTable(
  'org_memberships',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index('org_memberships_user_id_idx').on(t.userId),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_org_id_idx').on(t.orgId)],
);

/**
 * A project is created with `prod` alone (API-level behavior, routes/projects.ts);
 * any other key is added explicitly, optionally inheriting an existing
 * environment's configuration (lib/environment-inheritance.ts).
 */
export const environments = pgTable(
  'environments',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('environments_project_id_key_unique').on(t.projectId, t.key)],
);

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * The flag DEFINITION. `value_type`, `enum_options` and `default_value` live
 * here - project-scoped - rather than on the per-environment `flag_states`,
 * because the type is part of the flag's identity, not part of its state.
 *
 * A per-environment type would mean `flags.getString('tool.banner')` could be a
 * string in Staging and a boolean in Production: an SDK's typed accessor would
 * change its return type depending on which environment it happened to be
 * pointed at, which is not a thing a compiler can help anyone with. Same
 * argument for `enum_options` (the set of legal members is the flag's contract
 * with its call sites) and for `default_value` (the value a brand-new
 * environment starts from, so it has to predate any environment).
 *
 * What IS per-environment is the value actually served - `flag_states.value`.
 */
export const tools = pgTable(
  'tools',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** IMMUTABLE after creation - see the PATCH guard in routes/tools.ts. */
    valueType: flagValueType('value_type').notNull().default('boolean'),
    /** The legal members for `string_enum`; empty (and unused) for other types. */
    enumOptions: text('enum_options')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** What an environment serves when its own `flag_states.value` is NULL. */
    defaultValue: jsonb('default_value').$type<JsonValue>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('tools_project_id_key_unique').on(t.projectId, t.key),
    /*
     * `cardinality()`, NOT `array_length(x, 1)`: array_length returns NULL for
     * an empty array, and a CHECK whose expression evaluates to NULL PASSES.
     * So `array_length(enum_options, 1) > 0` would be NULL > 0 => NULL => row
     * accepted - the exact state this constraint exists to forbid, waved
     * through silently. cardinality() returns 0 for an empty array.
     */
    check(
      'tools_enum_options_required',
      sql`${t.valueType} <> 'string_enum' OR cardinality(${t.enumOptions}) > 0`,
    ),
  ],
);

/** Per-environment flag state for a tool. `rollout_percent` null = no % rollout. */
export const flagStates = pgTable(
  'flag_states',
  {
    id: id(),
    toolId: uuid('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    /**
     * The value this environment serves while the flag is on. NULL = inherit
     * `tools.default_value`, which is also the correct state for a `boolean`
     * flag: its value IS `enabled`, so there is nothing to store here.
     *
     * Nullable rather than notNull-with-default because null is itself a legal
     * JSON value for a configured flag - "not set, inherit the definition" has
     * to stay distinguishable from "deliberately set to null".
     */
    value: jsonb('value').$type<JsonValue>(),
    rolloutPercent: integer('rollout_percent'),
    targetingRules: jsonb('targeting_rules').$type<unknown[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('flag_states_tool_id_environment_id_unique').on(t.toolId, t.environmentId),
    index('flag_states_environment_id_idx').on(t.environmentId),
    check(
      'flag_states_rollout_percent_range',
      sql`${t.rolloutPercent} IS NULL OR (${t.rolloutPercent} >= 0 AND ${t.rolloutPercent} <= 100)`,
    ),
  ],
);

/** Reusable targeting segments (plan / region / custom attributes), shared across a project's environments. */
export const segments = pgTable(
  'segments',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    rules: jsonb('rules').$type<unknown[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('segments_project_id_key_unique').on(t.projectId, t.key)],
);

// ── Remote config ─────────────────────────────────────────────────────────────

/** Current config value per tool per environment; `version` mirrors the latest config_versions row. */
export const toolConfigs = pgTable(
  'tool_configs',
  {
    id: id(),
    toolId: uuid('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}),
    version: integer('version').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('tool_configs_tool_id_environment_id_unique').on(t.toolId, t.environmentId),
    index('tool_configs_environment_id_idx').on(t.environmentId),
  ],
);

/** Append-only history; rollback = a new version copying an old one (`restored_from_version`). */
export const configVersions = pgTable(
  'config_versions',
  {
    id: id(),
    toolConfigId: uuid('tool_config_id')
      .notNull()
      .references(() => toolConfigs.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    restoredFromVersion: integer('restored_from_version'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('config_versions_tool_config_id_version_unique').on(t.toolConfigId, t.version),
  ],
);

// ── Delivery plane handoff ────────────────────────────────────────────────────

/**
 * Published ruleset snapshots per environment. Postgres is the source of truth:
 * KV must always be republishable from here. `content_hash` doubles as the ETag.
 */
export const rulesetVersions = pgTable(
  'ruleset_versions',
  {
    id: id(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    contentHash: text('content_hash').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ruleset_versions_environment_id_version_unique').on(t.environmentId, t.version),
  ],
);

// ── API keys ──────────────────────────────────────────────────────────────────

/**
 * Reveal-once: the full key is returned only at creation; `prefix` (the visible
 * first chars) + `key_hash` are all that is stored. Revocation = set `revoked_at`.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    environmentId: uuid('environment_id')
      .notNull()
      .references(() => environments.id, { onDelete: 'cascade' }),
    kind: apiKeyKind('kind').notNull(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('api_keys_prefix_unique').on(t.prefix),
    index('api_keys_environment_id_idx').on(t.environmentId),
  ],
);

// ── Audit ─────────────────────────────────────────────────────────────────────

/** Org-scoped, append-only. `actor_id` null = system action. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_org_id_created_at_idx').on(t.orgId, t.createdAt)],
);

// ── Relations ─────────────────────────────────────────────────────────────────

export const orgsRelations = relations(orgs, ({ many }) => ({
  memberships: many(orgMemberships),
  projects: many(projects),
  auditEntries: many(auditLog),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(orgMemberships),
}));

export const orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
  org: one(orgs, { fields: [orgMemberships.orgId], references: [orgs.id] }),
  user: one(users, { fields: [orgMemberships.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(orgs, { fields: [projects.orgId], references: [orgs.id] }),
  environments: many(environments),
  tools: many(tools),
  segments: many(segments),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, { fields: [environments.projectId], references: [projects.id] }),
  flagStates: many(flagStates),
  toolConfigs: many(toolConfigs),
  rulesetVersions: many(rulesetVersions),
  apiKeys: many(apiKeys),
}));

export const toolsRelations = relations(tools, ({ one, many }) => ({
  project: one(projects, { fields: [tools.projectId], references: [projects.id] }),
  flagStates: many(flagStates),
  configs: many(toolConfigs),
}));

export const flagStatesRelations = relations(flagStates, ({ one }) => ({
  tool: one(tools, { fields: [flagStates.toolId], references: [tools.id] }),
  environment: one(environments, {
    fields: [flagStates.environmentId],
    references: [environments.id],
  }),
}));

export const segmentsRelations = relations(segments, ({ one }) => ({
  project: one(projects, { fields: [segments.projectId], references: [projects.id] }),
}));

export const toolConfigsRelations = relations(toolConfigs, ({ one, many }) => ({
  tool: one(tools, { fields: [toolConfigs.toolId], references: [tools.id] }),
  environment: one(environments, {
    fields: [toolConfigs.environmentId],
    references: [environments.id],
  }),
  versions: many(configVersions),
}));

export const configVersionsRelations = relations(configVersions, ({ one }) => ({
  toolConfig: one(toolConfigs, {
    fields: [configVersions.toolConfigId],
    references: [toolConfigs.id],
  }),
  author: one(users, { fields: [configVersions.authorId], references: [users.id] }),
}));

export const rulesetVersionsRelations = relations(rulesetVersions, ({ one }) => ({
  environment: one(environments, {
    fields: [rulesetVersions.environmentId],
    references: [environments.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  environment: one(environments, {
    fields: [apiKeys.environmentId],
    references: [environments.id],
  }),
  createdBy: one(users, { fields: [apiKeys.createdById], references: [users.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  org: one(orgs, { fields: [auditLog.orgId], references: [orgs.id] }),
  actor: one(users, { fields: [auditLog.actorId], references: [users.id] }),
}));

// ── Row types ─────────────────────────────────────────────────────────────────

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type OrgMembership = typeof orgMemberships.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Environment = typeof environments.$inferSelect;
export type Tool = typeof tools.$inferSelect;
export type FlagState = typeof flagStates.$inferSelect;
export type Segment = typeof segments.$inferSelect;
export type ToolConfig = typeof toolConfigs.$inferSelect;
export type ConfigVersion = typeof configVersions.$inferSelect;
export type RulesetVersion = typeof rulesetVersions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
