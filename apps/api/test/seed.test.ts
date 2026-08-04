/**
 * The dev seed script. It is a documented setup step (`npm run db:seed`), so a
 * silent break costs every new developer an afternoon - and it is the one place
 * the interesting prod flag states (a kill switch, a 25% rollout) are asserted
 * end to end.
 *
 * seed.ts runs on import via a top-level `seed().catch(...)`, so each case here
 * resets the module registry and re-imports to trigger a run.
 */
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../src/db';
import {
  configVersions,
  environments,
  flagStates,
  orgMemberships,
  orgs,
  projects,
  segments,
  toolConfigs,
  tools,
} from '../src/db/schema';
import { resetDb, setupTestApp, type TestHarness } from './helpers';

let h: TestHarness;
let db: Db;
let logs: string[];

beforeAll(async () => {
  h = await setupTestApp();
  db = h.db;
});
afterAll(async () => {
  await h.app.close();
});

beforeEach(async () => {
  await resetDb(db);
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((msg: unknown) => void logs.push(String(msg)));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Imports seed.ts (which starts the run) and waits for it to settle. The module
 * does not export a promise, so completion is observed through its log line.
 */
async function runSeed(): Promise<void> {
  await import('../src/db/seed');
  for (let i = 0; i < 100; i++) {
    if (logs.some((l) => l.startsWith('Seeded:') || l.startsWith('Seed skipped:'))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`seed did not finish; logs: ${JSON.stringify(logs)}`);
}

describe('dev seed', () => {
  it('creates the demo org, admin, and membership', async () => {
    await runSeed();

    const [org] = await db.select().from(orgs).where(eq(orgs.name, 'Demo Org'));
    expect(org).toBeDefined();
    const memberships = await db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.orgId, org!.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.role).toBe('admin');
  });

  it('creates one project with dev, staging, and prod', async () => {
    await runSeed();

    const [project] = await db.select().from(projects);
    expect(project!.name).toBe('Demo Project');
    const envRows = await db
      .select()
      .from(environments)
      .where(eq(environments.projectId, project!.id));
    expect(envRows.map((e) => e.key).sort()).toEqual(['dev', 'prod', 'staging']);
  });

  it('registers five tools with tags', async () => {
    await runSeed();

    const toolRows = await db.select().from(tools);
    expect(toolRows).toHaveLength(5);
    expect(toolRows.map((t) => t.key).sort()).toEqual([
      'tool.banner-message',
      'tool.summarize',
      'tool.summarize-model',
      'tool.tone-rewrite',
      'tool.translate',
    ]);
    expect(toolRows.find((t) => t.key === 'tool.tone-rewrite')!.tags).toContain('experimental');
  });

  it('seeds a mixed set of flag types so the dashboard has value controls to render', async () => {
    await runSeed();

    const toolRows = await db.select().from(tools);
    const byKey = (key: string) => toolRows.find((t) => t.key === key)!;
    expect(toolRows.filter((t) => t.valueType === 'boolean')).toHaveLength(3);

    expect(byKey('tool.banner-message')).toMatchObject({
      valueType: 'string',
      enumOptions: [],
      defaultValue: 'Welcome to the demo.',
    });
    expect(byKey('tool.summarize-model')).toMatchObject({
      valueType: 'string_enum',
      enumOptions: ['fast', 'balanced', 'quality'],
      defaultValue: 'balanced',
    });
  });

  it('gives the typed flags a different value in prod than in dev/staging', async () => {
    await runSeed();

    const envRows = await db.select().from(environments);
    const prodId = envRows.find((e) => e.key === 'prod')!.id;
    const toolRows = await db.select().from(tools);
    const states = await db.select().from(flagStates);
    const valueIn = (key: string, environmentId: string) => {
      const tool = toolRows.find((t) => t.key === key)!;
      return states.find((s) => s.toolId === tool.id && s.environmentId === environmentId)!.value;
    };
    const devId = envRows.find((e) => e.key === 'dev')!.id;

    expect(valueIn('tool.summarize-model', prodId)).toBe('quality');
    expect(valueIn('tool.summarize-model', devId)).toBe('fast');
    expect(valueIn('tool.banner-message', prodId)).toMatch(/maintenance/);
    // Boolean flags store no value at all - theirs is `enabled`.
    expect(valueIn('tool.summarize', prodId)).toBeNull();
  });

  it('leaves dev and staging fully on', async () => {
    await runSeed();

    const nonProd = await db.select().from(environments);
    const devIds = nonProd.filter((e) => e.key !== 'prod').map((e) => e.id);
    const states = await db.select().from(flagStates);

    const nonProdStates = states.filter((s) => devIds.includes(s.environmentId));
    expect(nonProdStates).toHaveLength(10); // 5 tools x 2 environments
    expect(nonProdStates.every((s) => s.enabled)).toBe(true);
    expect(nonProdStates.every((s) => s.rolloutPercent === null)).toBe(true);
  });

  it('kill-switches translate and puts tone-rewrite on a 25% rollout in prod only', async () => {
    await runSeed();

    const [prod] = await db.select().from(environments).where(eq(environments.key, 'prod'));
    const toolRows = await db.select().from(tools);
    const prodStates = await db
      .select()
      .from(flagStates)
      .where(eq(flagStates.environmentId, prod!.id));
    const byKey = (key: string) => {
      const tool = toolRows.find((t) => t.key === key)!;
      return prodStates.find((s) => s.toolId === tool.id)!;
    };

    expect(byKey('tool.translate').enabled).toBe(false);
    expect(byKey('tool.tone-rewrite').rolloutPercent).toBe(25);
    // Everything else is plain on.
    expect(byKey('tool.summarize').enabled).toBe(true);
    expect(byKey('tool.summarize').rolloutPercent).toBeNull();
  });

  it('creates the beta-users segment', async () => {
    await runSeed();

    const [segment] = await db.select().from(segments);
    expect(segment!.key).toBe('beta-users');
    expect(segment!.rules).toEqual([
      { attribute: 'plan', operator: 'in', values: ['pro', 'team'] },
    ]);
  });

  it('creates versioned prod config on exactly the two configured tools', async () => {
    await runSeed();

    const configs = await db.select().from(toolConfigs);
    expect(configs).toHaveLength(2);
    expect(configs.every((c) => c.version === 1)).toBe(true);

    const versions = await db.select().from(configVersions);
    expect(versions).toHaveLength(2);
    // The fallback payload rides inside the config value.
    const value = configs[0]!.value as { fallback: { mode: string; message: string } };
    expect(value.fallback.mode).toBe('message');
    expect(value.fallback.message).toMatch(/temporarily unavailable/);
  });

  it('is safe to re-run - the second pass skips instead of duplicating', async () => {
    await runSeed();
    expect(logs.some((l) => l.startsWith('Seeded:'))).toBe(true);

    logs = [];
    vi.resetModules();
    await runSeed();

    expect(logs.some((l) => l.startsWith('Seed skipped:'))).toBe(true);
    expect(await db.select().from(orgs)).toHaveLength(1);
    expect(await db.select().from(tools)).toHaveLength(5);
    expect(process.exitCode).toBeFalsy();
  });
});
