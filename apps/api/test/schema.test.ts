/**
 * Smoke test for the schema module: guards table/column names (the committed
 * migrations depend on them) without needing a database.
 */
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import * as schema from '../src/db/schema';

const EXPECTED_TABLES = {
  orgs: schema.orgs,
  users: schema.users,
  org_memberships: schema.orgMemberships,
  projects: schema.projects,
  environments: schema.environments,
  tools: schema.tools,
  flag_states: schema.flagStates,
  segments: schema.segments,
  tool_configs: schema.toolConfigs,
  config_versions: schema.configVersions,
  ruleset_versions: schema.rulesetVersions,
  api_keys: schema.apiKeys,
  audit_log: schema.auditLog,
} as const;

describe('db schema', () => {
  it('declares every table of the multi-tenant model under its expected name', () => {
    for (const [name, table] of Object.entries(EXPECTED_TABLES)) {
      expect(getTableName(table)).toBe(name);
    }
  });

  it('uses the agreed enum values for roles and key kinds', () => {
    expect(schema.membershipRole.enumValues).toEqual(['admin', 'developer', 'viewer']);
    expect(schema.apiKeyKind.enumValues).toEqual(['server', 'client']);
  });

  it('links users to Keycloak via a required keycloak_sub', () => {
    const cols = getTableColumns(schema.users);
    expect(cols.keycloakSub.name).toBe('keycloak_sub');
    expect(cols.keycloakSub.notNull).toBe(true);
  });

  it('stores API keys as prefix + hash only, with revocation support', () => {
    const cols = getTableColumns(schema.apiKeys);
    expect(cols.prefix.notNull).toBe(true);
    expect(cols.keyHash.name).toBe('key_hash');
    expect(cols.keyHash.notNull).toBe(true);
    expect(cols.revokedAt.notNull).toBe(false);
    expect(Object.keys(cols)).not.toContain('key');
  });

  it('keeps ruleset snapshots versioned per environment with a content hash', () => {
    const cols = getTableColumns(schema.rulesetVersions);
    expect(cols.version.notNull).toBe(true);
    expect(cols.contentHash.name).toBe('content_hash');
    expect(cols.snapshot.notNull).toBe(true);
  });

  it('makes config history append-only with author + version columns', () => {
    const cols = getTableColumns(schema.configVersions);
    expect(cols.version.notNull).toBe(true);
    expect(cols.value.notNull).toBe(true);
    expect(cols.authorId.name).toBe('author_id');
    expect(cols.createdAt.notNull).toBe(true);
  });
});
