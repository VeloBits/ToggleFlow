// @vitest-environment happy-dom
/**
 * The reading rules for an audit entry: the event catalog and its fallback, the
 * before/after extraction and its two asymmetries, value formatting, target
 * resolution, and the filter predicate.
 *
 * Payload shapes here are copied from the real `writeAudit` call sites in
 * apps/api - a fixture that invents its own shape tests nothing. Where a shape
 * is unusual (a partial `after` against a snapshot `before`, an `after` that
 * carries context rather than change) the test names the call site.
 */
import { describe, expect, it } from 'vitest';

import type { AuditEntry } from '../src/api/client';
import {
  ACTION_GROUPS,
  actionGroup,
  auditEventMeta,
  entityLabel,
  parseAction,
} from '../src/features/audit/audit-events';
import {
  EMPTY_FILTER,
  activeAuditFilterCount,
  matchesAuditFilter,
} from '../src/features/audit/audit-filter';
import {
  buildAuditRow,
  buildAuditSummary,
  contextFacts,
  fieldLabel,
  formatFieldValue,
} from '../src/features/audit/audit-summary';

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'a1',
  actorId: 'u1',
  action: 'flag.update',
  entityType: 'flag_state',
  entityId: 'fs1',
  before: null,
  after: null,
  createdAt: '2026-07-20T10:00:00.000Z',
  ...over,
});

describe('the event catalog', () => {
  it('names a known action in English', () => {
    const meta = auditEventMeta('flag.update', 'flag_state');
    expect(meta.subject).toBe('Flag state');
    expect(meta.verb).toBe('changed');
    expect(meta.badge).toBe('CHANGED');
    expect(meta.tone).toBe('update');
  });

  it('tints the two events that change what production serves', () => {
    expect(auditEventMeta('ruleset.republish', 'environment').tone).toBe('notable');
    expect(auditEventMeta('config.rollback', 'tool_config').tone).toBe('notable');
  });

  it('splits an action into entity and verb', () => {
    expect(parseAction('api_key.revoke')).toEqual({ entity: 'api_key', verb: 'revoke' });
    expect(parseAction('tool.bulk_upsert')).toEqual({ entity: 'tool', verb: 'bulk_upsert' });
  });

  it('humanises an action nobody has catalogued, and tints it from its verb', () => {
    // The column is free-form text with no CHECK, so the API can ship a new
    // action without a dashboard release. It must not render blank.
    const meta = auditEventMeta('webhook.delete', 'webhook');
    expect(meta.tone).toBe('destroy');
    expect(meta.subject).toBe('Webhook');
    expect(meta.badge).toBe('DELETE');
    expect(meta.verb).toBe('delete');
  });

  it('tints an uncatalogued create, publish and update from the verb too', () => {
    expect(auditEventMeta('webhook.create', 'webhook').tone).toBe('create');
    expect(auditEventMeta('snapshot.publish', 'snapshot').tone).toBe('notable');
    expect(auditEventMeta('webhook.update', 'webhook').tone).toBe('update');
  });

  it('falls back to neutral for a verb it cannot read', () => {
    const meta = auditEventMeta('thing.frobnicate', 'thing');
    expect(meta.tone).toBe('neutral');
  });

  it('survives an action that is not dotted at all', () => {
    const meta = auditEventMeta('legacy_event', 'org');
    expect(meta.badge).toBe('EVENT');
    expect(meta.verb).toBe('recorded');
    expect(meta.subject).toBe('Organization');
  });

  it('labels every entity type it is given', () => {
    expect(entityLabel('org_membership')).toBe('Membership');
    expect(entityLabel('tool')).toBe('Flag');
    expect(entityLabel('brand_new_thing')).toBe('Brand new thing');
  });

  it('groups the flag and tool actions together', () => {
    // `tool.*` and `flag.*` are both "a flag" to a user; splitting them would
    // leak the server's internal naming onto the filter menu.
    expect(actionGroup('tool.create')).toBe('flag');
    expect(actionGroup('flag.update')).toBe('flag');
    expect(actionGroup('api_key.revoke')).toBe('access');
    expect(actionGroup('member.add')).toBe('access');
    expect(actionGroup('ruleset.republish')).toBe('delivery');
    expect(actionGroup('nothing.claims_this')).toBeNull();
  });

  it('offers no duplicate group ids', () => {
    const ids = ACTION_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('extracting changes', () => {
  it('reads a flag state change as a field-level diff', () => {
    // apps/api/src/routes/flags.ts:105 - snapshot before, PATCH body after.
    const summary = buildAuditSummary(
      entry({
        before: { enabled: true, value: null, rolloutPercent: 25, targetingRules: [] },
        after: { enabled: false },
      }),
    );
    expect(summary.changes).toHaveLength(1);
    expect(summary.changes[0]).toMatchObject({
      field: 'enabled',
      label: 'Enabled',
      before: true,
      after: false,
      kind: 'changed',
    });
  });

  it('ignores snapshot fields the patch never mentioned', () => {
    // The asymmetry that matters: `before` is a 7-key snapshot and `after` is a
    // partial PATCH body (apps/api/src/routes/tools.ts:268). A field only in
    // `before` was not part of the patch, so reporting it as removed would
    // invent a change nobody made.
    const summary = buildAuditSummary(
      entry({
        action: 'tool.update',
        entityType: 'tool',
        before: {
          name: 'Summarize',
          description: 'old',
          tags: ['ai'],
          metadata: {},
          archived: false,
          enumOptions: null,
          defaultValue: true,
        },
        after: { description: 'new' },
      }),
    );
    expect(summary.changes.map((change) => change.field)).toEqual(['description']);
  });

  it('drops a patched field whose value did not actually change', () => {
    const summary = buildAuditSummary(
      entry({
        before: { enabled: true, rolloutPercent: 25 },
        after: { enabled: true, rolloutPercent: 50 },
      }),
    );
    expect(summary.changes.map((change) => change.field)).toEqual(['rolloutPercent']);
  });

  it('does not report a change when only the key order moved', () => {
    // A re-serialised targeting rule can come back with its keys reordered. An
    // audit log that cries "changed" at that trains people to ignore it.
    const summary = buildAuditSummary(
      entry({
        before: { targetingRules: [{ attribute: 'plan', op: 'in' }] },
        after: { targetingRules: [{ op: 'in', attribute: 'plan' }] },
      }),
    );
    expect(summary.changes).toHaveLength(0);
    expect(summary.hasPayload).toBe(true);
  });

  it('reads a first-ever write as values being set, not as a transition', () => {
    // `before` is null for the first flag_states write for a tool/env pair.
    const summary = buildAuditSummary(
      entry({ before: null, after: { enabled: true, rolloutPercent: 10 } }),
    );
    expect(summary.changes.map((change) => change.kind)).toEqual(['added', 'added']);
  });

  it('treats a cleared rollout as a change, because null is a real state here', () => {
    const summary = buildAuditSummary(
      entry({ before: { rolloutPercent: 25 }, after: { rolloutPercent: null } }),
    );
    expect(summary.changes[0]).toMatchObject({ field: 'rolloutPercent', kind: 'changed' });
  });

  it('reads a before-only payload on an uncatalogued action as removals', () => {
    const summary = buildAuditSummary(
      entry({
        action: 'webhook.disable',
        entityType: 'webhook',
        before: { url: 'x' },
        after: null,
      }),
    );
    expect(summary.changes).toEqual([
      { field: 'url', label: 'Url', before: 'x', after: undefined, kind: 'removed' },
    ]);
  });
});

describe('snapshots rather than diffs', () => {
  it('reads a creation as facts', () => {
    const summary = buildAuditSummary(
      entry({
        action: 'tool.create',
        entityType: 'tool',
        after: { key: 'tool.summarize', name: 'Summarize', valueType: 'boolean' },
      }),
    );
    expect(summary.changes).toEqual([]);
    expect(summary.facts.map((fact) => fact.label)).toEqual(['Key', 'Name', 'Type']);
  });

  it('reads a deletion as what was lost', () => {
    const summary = buildAuditSummary(
      entry({
        action: 'segment.delete',
        entityType: 'segment',
        before: { key: 'beta', name: 'Beta users' },
      }),
    );
    expect(summary.facts.map((fact) => fact.field)).toEqual(['key', 'name']);
  });

  it('keeps event context out of the fields that changed', () => {
    // apps/api/src/routes/projects.ts:221 records projectId and the inheritance
    // provenance beside the environment's own fields. "Project" listed among the
    // changes would imply the project was edited.
    const created = entry({
      action: 'environment.create',
      entityType: 'environment',
      after: {
        key: 'staging',
        name: 'Staging',
        projectId: 'p1',
        inheritedFrom: { id: 'e1', key: 'prod' },
        copied: { flagStates: 5, toolConfigs: 2 },
      },
    });
    const summary = buildAuditSummary(created);
    expect(summary.facts.map((fact) => fact.field)).toEqual([
      'key',
      'name',
      'inheritedFrom',
      'copied',
    ]);
    expect(contextFacts(created)).toEqual([{ field: 'projectId', label: 'Project', value: 'p1' }]);
  });

  it('reports no payload at all when there is none', () => {
    const summary = buildAuditSummary(entry({ before: null, after: null }));
    expect(summary.hasPayload).toBe(false);
    expect(summary.changes).toEqual([]);
    expect(summary.facts).toEqual([]);
  });
});

describe('formatting a value', () => {
  it('speaks the product vocabulary for enabled, and colours it', () => {
    expect(formatFieldValue('enabled', true)).toMatchObject({ text: 'ON', tone: 'on' });
    expect(formatFieldValue('enabled', false)).toMatchObject({ text: 'OFF', tone: 'off' });
  });

  it('does not colour a boolean whose true is not good news', () => {
    // Green "Archived: Yes" says the opposite of what it means.
    expect(formatFieldValue('archived', true)).toMatchObject({ text: 'Yes', tone: 'neutral' });
    expect(formatFieldValue('archived', false)).toMatchObject({ text: 'No', tone: 'neutral' });
  });

  it('renders absence as a dash, for both undefined and null', () => {
    expect(formatFieldValue('enabled', undefined)).toMatchObject({ text: '—', absent: true });
    expect(formatFieldValue('rolloutPercent', null)).toMatchObject({ text: '—', absent: true });
  });

  it('suffixes a rollout with a percent sign', () => {
    expect(formatFieldValue('rolloutPercent', 25).text).toBe('25%');
    expect(formatFieldValue('version', 4).text).toBe('4');
  });

  it('collapses a nested value to a count rather than inlining JSON', () => {
    expect(formatFieldValue('targetingRules', [{ a: 1 }, { b: 2 }]).text).toBe('2 items');
    expect(formatFieldValue('value', { a: 1 }).text).toBe('1 field');
    expect(formatFieldValue('metadata', {}).text).toBe('empty');
    expect(formatFieldValue('tags', []).text).toBe('none');
  });

  it('joins a list of primitives, because that list is the news', () => {
    expect(formatFieldValue('tags', ['ai', 'beta']).text).toBe('ai, beta');
    expect(formatFieldValue('created', ['a.b', 'c.d']).text).toBe('a.b, c.d');
  });

  it('spells out an inherited environment and what it copied', () => {
    // The inner keys are camelCase resource names off the inheritance registry,
    // so they arrive through `fieldLabel`'s camelCase split like any other.
    expect(formatFieldValue('copied', { flagStates: 5, toolConfigs: 2 }).text).toBe(
      'Flag States 5, Tool Configs 2',
    );
    expect(formatFieldValue('copied', {}).text).toBe('nothing');
    expect(formatFieldValue('inheritedFrom', { id: 'e1', key: 'prod' })).toMatchObject({
      text: 'prod',
      mono: true,
    });
  });

  it('shortens a content hash and marks machine tokens mono', () => {
    expect(formatFieldValue('contentHash', 'a'.repeat(64))).toMatchObject({
      text: 'a'.repeat(12),
      mono: true,
    });
    expect(formatFieldValue('key', 'tool.summarize').mono).toBe(true);
    expect(formatFieldValue('name', 'Summarize').mono).toBe(false);
  });

  it('turns an ISO timestamp into something readable', () => {
    const formatted = formatFieldValue('revokedAt', '2026-07-20T10:00:00.000Z');
    expect(formatted.text).not.toContain('T');
    expect(formatted.text).toBe(new Date('2026-07-20T10:00:00.000Z').toLocaleString());
  });

  it('leaves a string that merely looks date-ish alone', () => {
    expect(formatFieldValue('name', '2026-not-a-date').text).toBe('2026-not-a-date');
  });

  it('distinguishes an empty string from an absent one', () => {
    expect(formatFieldValue('description', '')).toMatchObject({ text: 'empty', absent: false });
  });

  it('labels a field the catalog has never seen', () => {
    expect(fieldLabel('rolloutPercent')).toBe('Rollout');
    expect(fieldLabel('someNewField')).toBe('Some New Field');
  });
});

describe('resolving the target', () => {
  it('prefers the name recorded in the payload over a live lookup', () => {
    // The payload holds the name the thing had at the time. A lookup holds what
    // it is called now - and for a deleted flag, nothing at all.
    const summary = buildAuditSummary(
      entry({ action: 'tool.delete', entityType: 'tool', before: { key: 'old.key', name: 'Old' } }),
      { flag: () => 'Renamed Since' },
    );
    expect(summary.target).toMatchObject({ name: 'old.key', historical: true, mono: true });
  });

  it('reads an environment by name and a flag by key', () => {
    expect(
      buildAuditSummary(
        entry({
          action: 'environment.create',
          entityType: 'environment',
          after: { key: 'staging', name: 'Staging' },
        }),
      ).target,
    ).toMatchObject({ name: 'Staging', mono: false });

    expect(
      buildAuditSummary(
        entry({ action: 'tool.create', entityType: 'tool', after: { key: 'a.b', name: 'A B' } }),
      ).target,
    ).toMatchObject({ name: 'a.b', mono: true });
  });

  it('falls back to a lookup when the payload records only an id', () => {
    // ruleset.republish records version and contentHash, never the env name.
    const summary = buildAuditSummary(
      entry({
        action: 'ruleset.republish',
        entityType: 'environment',
        entityId: 'e1',
        after: { version: 4, contentHash: 'abc' },
      }),
      { environment: (id) => (id === 'e1' ? 'Production' : null) },
    );
    expect(summary.target).toMatchObject({
      name: 'Production',
      historical: false,
      label: 'Environment',
    });
  });

  it('resolves a membership change through the member list', () => {
    // entityId is a user id here, not a membership key.
    const summary = buildAuditSummary(
      entry({
        action: 'member.update',
        entityType: 'org_membership',
        entityId: 'u2',
        before: { role: 'viewer' },
        after: { role: 'admin' },
      }),
      { actor: (id) => (id === 'u2' ? 'Ops Person' : null) },
    );
    expect(summary.target.name).toBe('Ops Person');
  });

  it('names a bulk sync by its project', () => {
    const summary = buildAuditSummary(
      entry({
        action: 'tool.bulk_upsert',
        entityType: 'project',
        entityId: 'p1',
        after: { created: ['a'], updated: [], archived: [], unchanged: 3, archiveMissing: false },
      }),
      { project: (id) => (id === 'p1' ? 'Control Plane' : null) },
    );
    expect(summary.target).toMatchObject({ label: 'Project', name: 'Control Plane' });
  });

  it('reports no name for a flag state change, because the API records none', () => {
    // entityId is the surrogate flag_states row id and no endpoint exposes it.
    // This is the documented gap, asserted so a future fix has to update it.
    const summary = buildAuditSummary(
      entry({ before: { enabled: true }, after: { enabled: false } }),
    );
    expect(summary.target).toMatchObject({ label: 'Flag state', name: null });
  });

  it('reports no name when the lookup cannot answer', () => {
    // The workspace only holds the selected project's environments; the log is
    // org-wide, so a sibling project's entry legitimately has no name.
    const summary = buildAuditSummary(
      entry({ action: 'ruleset.republish', entityType: 'environment', entityId: 'e9', after: {} }),
      { environment: () => null },
    );
    expect(summary.target.name).toBeNull();
  });

  it('ignores an empty string in the payload and moves on to the next key', () => {
    const summary = buildAuditSummary(
      entry({
        action: 'environment.update',
        entityType: 'environment',
        before: { name: '', key: 'prod' },
      }),
    );
    expect(summary.target.name).toBe('prod');
  });
});

describe('the row model and the filter', () => {
  const row = (over: Partial<AuditEntry> = {}, actor = 'Dev User') =>
    buildAuditRow(entry(over), {}, actor);

  it('makes the payload searchable, which is the only way to find a bulk sync', () => {
    const synced = row({
      action: 'tool.bulk_upsert',
      entityType: 'project',
      after: { created: ['checkout.v2'], updated: [], archived: [] },
    });
    expect(matchesAuditFilter(synced, { ...EMPTY_FILTER, search: 'checkout.v2' })).toBe(true);
  });

  it('requires every search term, in any order and across columns', () => {
    const edited = row(
      {
        action: 'tool.update',
        entityType: 'tool',
        before: { name: 'Checkout' },
        after: { name: 'Checkout v2' },
      },
      'Ana Dev',
    );
    expect(matchesAuditFilter(edited, { ...EMPTY_FILTER, search: 'ana checkout' })).toBe(true);
    expect(matchesAuditFilter(edited, { ...EMPTY_FILTER, search: 'checkout ana' })).toBe(true);
    expect(matchesAuditFilter(edited, { ...EMPTY_FILTER, search: 'ana segment' })).toBe(false);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(matchesAuditFilter(row(), { ...EMPTY_FILTER, search: '  FLAG.UPDATE  ' })).toBe(true);
  });

  it('filters by area', () => {
    expect(matchesAuditFilter(row(), { ...EMPTY_FILTER, group: 'flag' })).toBe(true);
    expect(matchesAuditFilter(row(), { ...EMPTY_FILTER, group: 'access' })).toBe(false);
  });

  it('filters by actor, and treats a null actor as the system', () => {
    expect(matchesAuditFilter(row(), { ...EMPTY_FILTER, actor: 'u1' })).toBe(true);
    expect(matchesAuditFilter(row(), { ...EMPTY_FILTER, actor: 'u2' })).toBe(false);
    expect(matchesAuditFilter(row(), { ...EMPTY_FILTER, actor: 'system' })).toBe(false);
    expect(
      matchesAuditFilter(row({ actorId: null }, 'system'), { ...EMPTY_FILTER, actor: 'system' }),
    ).toBe(true);
  });

  it('counts only the axes a badge should announce', () => {
    // Search is visible in its own field, so it is not counted.
    expect(activeAuditFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeAuditFilterCount({ ...EMPTY_FILTER, search: 'x' })).toBe(0);
    expect(activeAuditFilterCount({ search: 'x', group: 'flag', actor: 'u1' })).toBe(2);
  });
});
