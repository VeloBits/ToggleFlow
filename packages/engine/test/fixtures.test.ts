/**
 * Golden-fixture runner. Each file in fixtures/ holds one snapshot plus
 * cases of (toolKey, user context) → expected evaluation. Later SDK and
 * edge-worker tests reuse the same files (import from
 * `@toggleflow/engine/fixtures/<name>.json`) and must produce identical
 * results — that is the point of the shared engine.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { evaluateTool } from '../src/evaluate';
import {
  jsonObjectSchema,
  jsonValueSchema,
  parseRulesetSnapshot,
  userContextSchema,
} from '../src/schema';
import configFallback from '../fixtures/config-fallback.json';
import killSwitch from '../fixtures/kill-switch.json';
import rollout from '../fixtures/rollout.json';
import targeting from '../fixtures/targeting.json';

const fixtureSchema = z.object({
  description: z.string(),
  snapshot: z.unknown(),
  cases: z.array(
    z.object({
      name: z.string(),
      toolKey: z.string(),
      context: userContextSchema,
      expected: z.object({
        key: z.string(),
        enabled: z.boolean(),
        reason: z.enum(['kill_switch', 'targeting', 'rollout', 'default', 'not_found']),
        config: jsonObjectSchema.nullable(),
        fallback: jsonValueSchema.nullable(),
      }),
    }),
  ),
});

const fixtures = {
  'kill-switch': killSwitch,
  targeting,
  rollout,
  'config-fallback': configFallback,
};

for (const [name, raw] of Object.entries(fixtures)) {
  describe(`fixture: ${name}`, () => {
    const fixture = fixtureSchema.parse(raw);
    const snapshot = parseRulesetSnapshot(fixture.snapshot);

    for (const testCase of fixture.cases) {
      it(testCase.name, () => {
        expect(evaluateTool(snapshot, testCase.toolKey, testCase.context)).toEqual(
          testCase.expected,
        );
      });
    }
  });
}
