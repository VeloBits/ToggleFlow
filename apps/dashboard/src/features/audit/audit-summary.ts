/**
 * Turns one audit row into something a person can read at a glance.
 *
 * Deliberately a pure function of `(entry, lookup)` with no React in it: the
 * rules encoded here are the substance of this feature - which key is a change
 * and which is context, whose name is authoritative, what an absent `before`
 * means - and they need to be testable without rendering a table.
 *
 * ## The two asymmetries that shape everything below
 *
 * 1. `before` is a full snapshot; `after` is the request body. For the update
 *    actions the API writes a fixed snapshot into `before` and the raw PATCH
 *    body into `after` (see `apps/api/src/routes/tools.ts` and `flags.ts`), so
 *    the two objects do not have the same keys. The keys that matter are
 *    `after`'s: a field present in `before` and absent from `after` was simply
 *    not part of the patch, and listing it as removed invents a change nobody
 *    made.
 *
 * 2. A name recorded in the payload beats a name looked up by id. `before.key`
 *    is what the thing was called *at the time of the event*; a lookup returns
 *    what it is called now, and for a deleted flag returns nothing at all. An
 *    audit trail that renames history retroactively is not an audit trail, so
 *    the payload always wins and the lookup is the fallback.
 */
import type { AuditEntry } from '@/api/client';

import { auditEventMeta, entityLabel, type AuditEventMeta } from './audit-events';

/**
 * Resolves an id to a display name, for the entries whose payload records only
 * an id. Every resolver is allowed to answer `null`: the workspace only holds
 * the *selected* project's environments, flags and segments, and the audit log
 * is org-wide, so an entry from a sibling project legitimately has no name
 * available. That renders as the bare entity noun rather than as an error.
 */
export interface AuditLookup {
  project?: (id: string) => string | null;
  environment?: (id: string) => string | null;
  flag?: (id: string) => string | null;
  segment?: (id: string) => string | null;
  actor?: (id: string) => string | null;
}

export interface AuditChange {
  /** The raw payload key, kept so the detail panel can show what the API called it. */
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  /**
   * `added` covers both a genuinely new key and the first write to a row that
   * had no previous state at all (`before` is null for a flag's first edit), so
   * the UI renders it as a value being set rather than as a transition from
   * nothing.
   */
  kind: 'added' | 'removed' | 'changed';
}

export interface AuditFact {
  field: string;
  label: string;
  value: unknown;
}

export interface AuditTarget {
  /** The entity noun: "Flag", "Environment". Always present. */
  label: string;
  /** Its name or key, or null when neither the payload nor the workspace knows it. */
  name: string | null;
  /** True when `name` came out of the payload, i.e. is historically accurate. */
  historical: boolean;
  /** True when `name` is a machine key and should render mono. */
  mono: boolean;
}

export interface AuditSummary {
  meta: AuditEventMeta;
  target: AuditTarget;
  /** Field-level before/after pairs, for an event that modified something. */
  changes: AuditChange[];
  /** A flat snapshot, for an event that created or destroyed something. */
  facts: AuditFact[];
  /** False when the row carries no `before` and no `after` at all. */
  hasPayload: boolean;
}

/** Payload keys as column headings. Anything unmapped is humanised. */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  key: 'Key',
  email: 'Email',
  role: 'Role',
  description: 'Description',
  enabled: 'Enabled',
  value: 'Value',
  rolloutPercent: 'Rollout',
  targetingRules: 'Targeting rules',
  rules: 'Rules',
  tags: 'Tags',
  metadata: 'Metadata',
  archived: 'Archived',
  enumOptions: 'Options',
  defaultValue: 'Default value',
  valueType: 'Type',
  version: 'Version',
  restoredFromVersion: 'Restored from',
  contentHash: 'Content hash',
  serverKeys: 'Server keys',
  clientKeys: 'Client keys',
  kind: 'Kind',
  prefix: 'Prefix',
  revokedAt: 'Revoked',
  environments: 'Environments',
  projectId: 'Project',
  inheritedFrom: 'Inherited from',
  copied: 'Copied',
  created: 'Created',
  updated: 'Updated',
  unchanged: 'Unchanged',
  archiveMissing: 'Archive missing',
};

export const fieldLabel = (field: string): string =>
  FIELD_LABELS[field] ??
  field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Keys whose value is a machine token, not prose. */
const MONO_FIELDS = new Set(['key', 'prefix', 'contentHash', 'valueType', 'projectId']);

export const isMonoField = (field: string): boolean => MONO_FIELDS.has(field);

export interface FormattedValue {
  text: string;
  /** Drives the value chip's colour; only genuinely bi-state fields get one. */
  tone: 'on' | 'off' | 'neutral';
  mono: boolean;
  /** True when the value is absent rather than empty. */
  absent: boolean;
}

const ABSENT: FormattedValue = { text: '—', tone: 'neutral', mono: false, absent: true };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A payload value as one short line of text.
 *
 * Field-aware on purpose. A bare `true` is not a display string: for `enabled`
 * it is "ON", the word this whole product turns on, and for `archived` it is
 * "Yes" - and only the first of those deserves a colour, because green
 * "Archived: Yes" says the opposite of what it means.
 *
 * Nested values collapse to a count rather than to inlined JSON. The full value
 * is one click away in the detail panel, and a targeting rule flattened into a
 * table cell is exactly the unreadable string this rewrite exists to remove.
 */
export function formatFieldValue(field: string, value: unknown): FormattedValue {
  // `null` is a real state in this data, not a gap: it is how a rollout is
  // cleared. It renders the same as absent because "no rollout" and "rollout not
  // in this patch" look identical to a reader, and the diff view distinguishes
  // them for anyone who needs it.
  if (value === undefined || value === null) return ABSENT;

  if (typeof value === 'boolean') {
    if (field === 'enabled') {
      return { text: value ? 'ON' : 'OFF', tone: value ? 'on' : 'off', mono: false, absent: false };
    }
    return { text: value ? 'Yes' : 'No', tone: 'neutral', mono: false, absent: false };
  }

  if (typeof value === 'number') {
    const text = field === 'rolloutPercent' ? `${value}%` : String(value);
    return { text, tone: 'neutral', mono: false, absent: false };
  }

  if (typeof value === 'string') {
    if (field === 'contentHash') {
      return { text: value.slice(0, 12), tone: 'neutral', mono: true, absent: false };
    }
    // Timestamps arrive as ISO strings and are unreadable as such.
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?/.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return { text: parsed.toLocaleString(), tone: 'neutral', mono: false, absent: false };
      }
    }
    const text = value === '' ? 'empty' : value;
    return { text, tone: 'neutral', mono: isMonoField(field), absent: false };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { text: 'none', tone: 'neutral', mono: false, absent: false };
    const primitives = value.every((item) => typeof item !== 'object' || item === null);
    if (primitives) {
      return {
        text: value.map((item) => String(item)).join(', '),
        tone: 'neutral',
        mono: false,
        absent: false,
      };
    }
    return { text: countText(value.length, 'item'), tone: 'neutral', mono: false, absent: false };
  }

  /*
   * Whatever is left is an object. These values are read straight out of a
   * `jsonb` column, so the six cases above plus this one are exhaustive - there
   * is no `Date`, no `Map`, no class instance to fall through to, and a
   * defensive `String(value)` here would be a branch no test could ever reach.
   */
  const object = value as Record<string, unknown>;

  // The two shapes worth spelling out, because their counts *are* the news:
  // what an inherited environment copied, and which environment it copied.
  if (field === 'copied') {
    const parts = Object.entries(object).map(([key, count]) => `${fieldLabel(key)} ${count}`);
    return {
      text: parts.length > 0 ? parts.join(', ') : 'nothing',
      tone: 'neutral',
      mono: false,
      absent: false,
    };
  }
  if (field === 'inheritedFrom' && typeof object.key === 'string') {
    return { text: object.key, tone: 'neutral', mono: true, absent: false };
  }
  const keys = Object.keys(object);
  return {
    text: keys.length === 0 ? 'empty' : countText(keys.length, 'field'),
    tone: 'neutral',
    mono: false,
    absent: false,
  };
}

const countText = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Deep equality by serialisation, with object keys sorted first.
 *
 * Sorted because a re-serialised targeting rule can come back with its keys in a
 * different order than it went in, and an audit log that reports "Targeting
 * rules changed" when nothing changed trains people to ignore it.
 */
function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(value: unknown): string {
  return (
    JSON.stringify(value, (_key, raw: unknown) =>
      isPlainObject(raw)
        ? Object.fromEntries(Object.entries(raw).sort(([x], [y]) => x.localeCompare(y)))
        : raw,
    ) ?? 'undefined'
  );
}

/**
 * Which payload keys are context rather than change.
 *
 * `environment.create` records `projectId` and its inheritance provenance
 * alongside the environment's own fields. Those belong in the detail panel as
 * facts about the event, but listing "Project" among the changes implies the
 * project was edited.
 */
const CONTEXT_FIELDS = new Set(['projectId']);

function changesFrom(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChange[] {
  const changes: AuditChange[] = [];

  // See asymmetry (1) in the file docblock: iterate `after`, not the union.
  for (const field of Object.keys(after ?? {})) {
    if (CONTEXT_FIELDS.has(field)) continue;
    const nextValue = after![field];
    const hadKey = before !== null && field in before;
    const prevValue = hadKey ? before[field] : undefined;
    if (hadKey && sameValue(prevValue, nextValue)) continue;
    changes.push({
      field,
      label: fieldLabel(field),
      before: prevValue,
      after: nextValue,
      kind: hadKey ? 'changed' : 'added',
    });
  }

  // A key the patch explicitly cleared still counts, and `null` is how this API
  // clears a rollout - so it arrives above as a normal `changed`. What lands
  // here instead is a delete-shaped event that also carried an `after`.
  if (after === null && before !== null) {
    for (const field of Object.keys(before)) {
      if (CONTEXT_FIELDS.has(field)) continue;
      changes.push({
        field,
        label: fieldLabel(field),
        before: before[field],
        after: undefined,
        kind: 'removed',
      });
    }
  }

  return changes;
}

const factsFrom = (payload: Record<string, unknown> | null): AuditFact[] =>
  Object.entries(payload ?? {})
    .filter(([field]) => !CONTEXT_FIELDS.has(field))
    .map(([field, value]) => ({ field, label: fieldLabel(field), value }));

/**
 * Which payload keys name the thing, in preference order, per entity type.
 *
 * `environment` reads `name` before `key` because "Production" is what people
 * call it; `tool` and `segment` read `key` first because a flag key is what
 * appears in their code, and it is the string they will search this log for.
 */
const NAME_KEYS: Record<string, string[]> = {
  org: ['name'],
  project: ['name'],
  environment: ['name', 'key'],
  tool: ['key', 'name'],
  segment: ['key', 'name'],
  api_key: ['name'],
  org_membership: ['email'],
};

/** Which resolver can turn this entity type's `entityId` into a name. */
const RESOLVERS: Record<string, keyof AuditLookup> = {
  project: 'project',
  environment: 'environment',
  tool: 'flag',
  segment: 'segment',
  org_membership: 'actor',
};

/**
 * What the event acted on.
 *
 * `flag_state` and `tool_config` come back with `name: null` and there is
 * nothing to be done about it here: the API records the surrogate row id of the
 * `flag_states` / `tool_configs` row, and no endpoint exposes those ids, so the
 * flag and environment behind the single most common event in the log cannot be
 * recovered client-side. The detail panel shows the raw id for correlation; the
 * real fix is for `writeAudit` to record the environment and flag key it already
 * has in scope at the call site.
 */
function targetFor(entry: AuditEntry, lookup: AuditLookup): AuditTarget {
  const label = entityLabel(entry.entityType);

  for (const field of NAME_KEYS[entry.entityType] ?? []) {
    for (const payload of [entry.after, entry.before]) {
      const value = payload?.[field];
      if (typeof value === 'string' && value !== '') {
        return { label, name: value, historical: true, mono: isMonoField(field) };
      }
    }
  }

  const resolver = RESOLVERS[entry.entityType];
  if (resolver && entry.entityId) {
    const resolved = lookup[resolver]?.(entry.entityId) ?? null;
    if (resolved) return { label, name: resolved, historical: false, mono: false };
  }

  return { label, name: null, historical: false, mono: false };
}

/** The whole row, ready to render. */
export function buildAuditSummary(entry: AuditEntry, lookup: AuditLookup = {}): AuditSummary {
  const meta = auditEventMeta(entry.action, entry.entityType);
  const hasPayload = entry.before !== null || entry.after !== null;

  // A creation has nothing to compare against and a deletion has nothing left,
  // so both read as a flat snapshot. Only a modification is a diff.
  const asFacts =
    meta.payload === 'created' ? entry.after : meta.payload === 'removed' ? entry.before : null;

  return {
    meta,
    target: targetFor(entry, lookup),
    changes: asFacts ? [] : changesFrom(entry.before, entry.after),
    facts: asFacts ? factsFrom(asFacts) : [],
    hasPayload,
  };
}

/**
 * The context an `environment.create` carries about the event itself rather than
 * about the environment - surfaced separately in the detail panel so it is not
 * mistaken for a field that changed.
 */
export function contextFacts(entry: AuditEntry): AuditFact[] {
  return Object.entries(entry.after ?? {})
    .filter(([field]) => CONTEXT_FIELDS.has(field))
    .map(([field, value]) => ({ field, label: fieldLabel(field), value }));
}

/** One prepared table row: the entry, its reading, and what search matches. */
export interface AuditRow {
  entry: AuditEntry;
  summary: AuditSummary;
  actor: string;
  /** Lower-cased haystack for the search box. */
  haystack: string;
}

/**
 * How much of the raw payload the search box can see.
 *
 * Searching the payload is what makes "who touched `checkout.v2`?" answerable at
 * all, because a bulk sync records affected keys in its payload and nowhere
 * else. The cap keeps one pathological config blob from making every keystroke
 * scan a megabyte - anything past it is still readable in the detail panel.
 */
const HAYSTACK_PAYLOAD_LIMIT = 2000;

export function buildAuditRow(entry: AuditEntry, lookup: AuditLookup, actor: string): AuditRow {
  const summary = buildAuditSummary(entry, lookup);
  const payload = `${stable(entry.before)} ${stable(entry.after)}`.slice(0, HAYSTACK_PAYLOAD_LIMIT);
  const haystack = [
    entry.action,
    summary.meta.subject,
    summary.meta.verb,
    summary.meta.badge,
    summary.target.label,
    summary.target.name,
    entry.entityType,
    entry.entityId,
    actor,
    payload,
  ]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' ')
    .toLowerCase();

  return { entry, summary, actor, haystack };
}
