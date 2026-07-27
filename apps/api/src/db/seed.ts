/**
 * Dev seed: demo org → project → dev/staging/prod → a handful of tools with
 * flag state, a segment, and versioned config on two tools.
 *
 * Run with `pnpm db:seed` (after `pnpm db:migrate`). Safe to re-run: exits
 * early if the demo org already exists.
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../env';
import * as schema from './schema';

const DEMO_ORG_NAME = 'Demo Org';

async function seed() {
  const client = postgres(env.databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    const existing = await db
      .select({ id: schema.orgs.id })
      .from(schema.orgs)
      .where(eq(schema.orgs.name, DEMO_ORG_NAME));
    if (existing.length > 0) {
      console.log(`Seed skipped: "${DEMO_ORG_NAME}" already exists (${existing[0]?.id}).`);
      return;
    }

    await db.transaction(async (tx) => {
      const [org] = await tx.insert(schema.orgs).values({ name: DEMO_ORG_NAME }).returning();
      if (!org) throw new Error('failed to insert demo org');

      const [admin] = await tx
        .insert(schema.users)
        .values({
          keycloakSub: 'seed|demo-admin',
          email: 'demo-admin@example.test',
          displayName: 'Demo Admin',
        })
        .returning();
      if (!admin) throw new Error('failed to insert demo admin');

      await tx
        .insert(schema.orgMemberships)
        .values({ orgId: org.id, userId: admin.id, role: 'admin' });

      const [project] = await tx
        .insert(schema.projects)
        .values({ orgId: org.id, name: 'Demo Project' })
        .returning();
      if (!project) throw new Error('failed to insert demo project');

      const envRows = await tx
        .insert(schema.environments)
        .values([
          { projectId: project.id, key: 'dev', name: 'Development' },
          { projectId: project.id, key: 'staging', name: 'Staging' },
          { projectId: project.id, key: 'prod', name: 'Production' },
        ])
        .returning();
      const prodEnv = envRows.find((e) => e.key === 'prod');
      if (envRows.length !== 3 || !prodEnv) throw new Error('failed to insert environments');

      const toolRows = await tx
        .insert(schema.tools)
        .values([
          {
            projectId: project.id,
            key: 'tool.summarize',
            name: 'Summarize',
            description: 'Condense input text into a short summary.',
            tags: ['ai', 'text'],
            metadata: { category: 'ai' },
          },
          {
            projectId: project.id,
            key: 'tool.translate',
            name: 'Translate',
            description: 'Translate input text between languages.',
            tags: ['ai', 'text'],
            metadata: { category: 'ai' },
          },
          {
            projectId: project.id,
            key: 'tool.grammar-check',
            name: 'Grammar Check',
            description: 'Fix grammar and spelling in the input text.',
            tags: ['ai', 'text'],
            metadata: { category: 'ai' },
          },
          {
            projectId: project.id,
            key: 'tool.tone-rewrite',
            name: 'Tone Rewrite',
            description: 'Rewrite text in a chosen tone.',
            tags: ['ai', 'text', 'experimental'],
            metadata: { category: 'ai' },
          },
          {
            projectId: project.id,
            key: 'tool.title-case',
            name: 'Title Case',
            description: 'Convert text to title case.',
            tags: ['text', 'formatting'],
            metadata: { category: 'formatting' },
          },
        ])
        .returning();
      if (toolRows.length !== 5) throw new Error('failed to insert tools');

      // Flag state per tool per environment: everything on in dev/staging;
      // prod shows the interesting cases (a kill-switched tool, a % rollout).
      await tx.insert(schema.flagStates).values(
        toolRows.flatMap((tool) =>
          envRows.map((environment) => {
            const isProd = environment.id === prodEnv.id;
            return {
              toolId: tool.id,
              environmentId: environment.id,
              enabled: isProd && tool.key === 'tool.translate' ? false : true,
              rolloutPercent: isProd && tool.key === 'tool.tone-rewrite' ? 25 : null,
              targetingRules: [],
            };
          }),
        ),
      );

      await tx.insert(schema.segments).values({
        projectId: project.id,
        key: 'beta-users',
        name: 'Beta users',
        description: 'Paid plans that opted into beta tools.',
        rules: [{ attribute: 'plan', operator: 'in', values: ['pro', 'team'] }],
      });

      // Versioned config on two tools in prod (fallback payload rides inside
      // the config value, per brief §6D).
      const configuredTools = toolRows.filter(
        (t) => t.key === 'tool.summarize' || t.key === 'tool.tone-rewrite',
      );
      for (const tool of configuredTools) {
        const value = {
          maxInputChars: 4000,
          fallback: {
            mode: 'message',
            message: `${tool.name} is temporarily unavailable.`,
          },
        };
        const [toolConfig] = await tx
          .insert(schema.toolConfigs)
          .values({ toolId: tool.id, environmentId: prodEnv.id, value, version: 1 })
          .returning();
        if (!toolConfig) throw new Error(`failed to insert config for ${tool.key}`);
        await tx.insert(schema.configVersions).values({
          toolConfigId: toolConfig.id,
          version: 1,
          value,
          authorId: admin.id,
        });
      }
    });

    console.log(
      `Seeded: "${DEMO_ORG_NAME}" → Demo Project → dev/staging/prod, 5 tools, ` +
        '1 segment, versioned config on 2 tools.',
    );
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
