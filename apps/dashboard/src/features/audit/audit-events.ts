/**
 * The vocabulary of the audit log: what each recorded action means in English,
 * what it acted on, and how loudly it should read.
 *
 * The `action` column is free-form `text` with no CHECK constraint, so a new
 * action can ship from the API without a dashboard release. That is the reason
 * `auditEventMeta` never throws and never renders a blank: an unknown action is
 * humanised from its own two halves (`thing.did_something` -> "Thing did
 * something") and tinted from its verb. A log that hides events it does not
 * recognise is worse than useless - it is misleading, because absence reads as
 * "nothing happened".
 *
 * The catalog below is the 21 actions the API writes today. Keep it in step with
 * the `writeAudit` call sites; the fallback is a safety net, not a substitute.
 */
import {
  ArchiveIcon,
  BuildingIcon,
  CircleSlashIcon,
  FlagIcon,
  FolderIcon,
  HistoryIcon,
  KeyIcon,
  LayersIcon,
  PencilIcon,
  RotateCcwIcon,
  SlidersIcon,
  SparklesIcon,
  ToggleIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
  type IconProps,
} from '@/ui/icons';
import type { ComponentType } from 'react';

/**
 * How prominent an event is, which is a question about consequences rather than
 * about CRUD.
 *
 * `notable` exists for the two events that change what production actually
 * serves without changing any flag - a republish and a config rollback. Someone
 * scanning this page during an incident is looking for exactly those, and
 * grouping them under `update` with two hundred routine edits buries them.
 */
export type AuditTone = 'create' | 'update' | 'destroy' | 'notable' | 'neutral';

/**
 * Tone -> badge classes.
 *
 * Reuses the flag tokens rather than inventing audit-specific ones: green for
 * additive, blue for routine change, red for removal, amber for "this changed
 * what production serves". There is no `success`/`warning` token in this theme -
 * amber is `rollout` - and every one of these pairs a colour with an icon in
 * `AuditActionBadge`, because colour alone fails for a red/green deficiency.
 */
export const TONE_CLASS: Record<AuditTone, string> = {
  create: 'bg-on-soft text-on',
  update: 'bg-primary-soft text-primary',
  destroy: 'bg-off-soft text-off',
  notable: 'bg-rollout-soft text-rollout',
  neutral: 'bg-muted text-muted-foreground',
};

export interface AuditEventMeta {
  /** The noun the event acted on: "Flag", "Environment", "API key". */
  subject: string;
  /** Past-tense verb, lower case, so `${subject} ${verb}` is a sentence. */
  verb: string;
  /** The badge's short label, upper case. */
  badge: string;
  tone: AuditTone;
  icon: ComponentType<IconProps>;
  /**
   * Set when the payload is a snapshot of a thing that came into existence (so
   * it reads as facts) or ceased to (so it reads as what was lost), rather than
   * a before/after pair to be diffed. See `audit-summary.ts`.
   */
  payload?: 'created' | 'removed';
}

const CATALOG: Record<string, AuditEventMeta> = {
  // Org
  'org.bootstrap': {
    subject: 'Organization',
    verb: 'created on first sign-in',
    badge: 'CREATED',
    tone: 'create',
    icon: SparklesIcon,
    payload: 'created',
  },
  'org.create': {
    subject: 'Organization',
    verb: 'created',
    badge: 'CREATED',
    tone: 'create',
    icon: BuildingIcon,
    payload: 'created',
  },

  // Project
  'project.create': {
    subject: 'Project',
    verb: 'created',
    badge: 'CREATED',
    tone: 'create',
    icon: FolderIcon,
    payload: 'created',
  },
  'project.update': {
    subject: 'Project',
    verb: 'updated',
    badge: 'UPDATED',
    tone: 'update',
    icon: PencilIcon,
  },
  'project.delete': {
    subject: 'Project',
    verb: 'deleted',
    badge: 'DELETED',
    tone: 'destroy',
    icon: TrashIcon,
    payload: 'removed',
  },

  // Environment
  'environment.create': {
    subject: 'Environment',
    verb: 'created',
    badge: 'CREATED',
    tone: 'create',
    icon: LayersIcon,
    payload: 'created',
  },
  'environment.update': {
    subject: 'Environment',
    verb: 'updated',
    badge: 'UPDATED',
    tone: 'update',
    icon: PencilIcon,
  },
  'environment.delete': {
    subject: 'Environment',
    verb: 'deleted',
    badge: 'DELETED',
    tone: 'destroy',
    icon: TrashIcon,
    payload: 'removed',
  },

  // Flag definition (a "tool" in the server's older vocabulary)
  'tool.create': {
    subject: 'Flag',
    verb: 'created',
    badge: 'CREATED',
    tone: 'create',
    icon: FlagIcon,
    payload: 'created',
  },
  'tool.update': {
    subject: 'Flag',
    verb: 'updated',
    badge: 'UPDATED',
    tone: 'update',
    icon: PencilIcon,
  },
  'tool.delete': {
    subject: 'Flag',
    verb: 'deleted',
    badge: 'DELETED',
    tone: 'destroy',
    icon: TrashIcon,
    payload: 'removed',
  },
  'tool.bulk_upsert': {
    subject: 'Flags',
    verb: 'synced in bulk',
    badge: 'SYNCED',
    tone: 'update',
    icon: LayersIcon,
    payload: 'created',
  },

  // Flag state, per environment - the highest-volume event in the system
  'flag.update': {
    subject: 'Flag state',
    verb: 'changed',
    badge: 'CHANGED',
    tone: 'update',
    icon: ToggleIcon,
  },

  // Per-environment config payload
  'config.update': {
    subject: 'Config',
    verb: 'saved',
    badge: 'SAVED',
    tone: 'update',
    icon: SlidersIcon,
  },
  'config.rollback': {
    subject: 'Config',
    verb: 'rolled back',
    badge: 'ROLLED BACK',
    tone: 'notable',
    icon: RotateCcwIcon,
  },

  // Segments
  'segment.create': {
    subject: 'Segment',
    verb: 'created',
    badge: 'CREATED',
    tone: 'create',
    icon: UsersIcon,
    payload: 'created',
  },
  'segment.update': {
    subject: 'Segment',
    verb: 'updated',
    badge: 'UPDATED',
    tone: 'update',
    icon: PencilIcon,
  },
  'segment.delete': {
    subject: 'Segment',
    verb: 'deleted',
    badge: 'DELETED',
    tone: 'destroy',
    icon: TrashIcon,
    payload: 'removed',
  },

  // API keys
  'api_key.create': {
    subject: 'API key',
    verb: 'issued',
    badge: 'ISSUED',
    tone: 'create',
    icon: KeyIcon,
    payload: 'created',
  },
  'api_key.revoke': {
    subject: 'API key',
    verb: 'revoked',
    badge: 'REVOKED',
    tone: 'destroy',
    icon: CircleSlashIcon,
  },

  // Delivery
  'ruleset.republish': {
    subject: 'Ruleset',
    verb: 'republished',
    badge: 'PUBLISHED',
    tone: 'notable',
    icon: UploadIcon,
    payload: 'created',
  },

  // Membership
  'member.add': {
    subject: 'Member',
    verb: 'added',
    badge: 'ADDED',
    tone: 'create',
    icon: UsersIcon,
    payload: 'created',
  },
  'member.update': {
    subject: 'Member',
    verb: 'updated',
    badge: 'UPDATED',
    tone: 'update',
    icon: PencilIcon,
  },
  'member.remove': {
    subject: 'Member',
    verb: 'removed',
    badge: 'REMOVED',
    tone: 'destroy',
    icon: TrashIcon,
    payload: 'removed',
  },
};

/** Entity types, for the filter menu and the detail panel's metadata block. */
export const ENTITY_LABELS: Record<string, string> = {
  org: 'Organization',
  org_membership: 'Membership',
  project: 'Project',
  environment: 'Environment',
  tool: 'Flag',
  flag_state: 'Flag state',
  tool_config: 'Config',
  segment: 'Segment',
  api_key: 'API key',
};

export const entityLabel = (entityType: string): string =>
  ENTITY_LABELS[entityType] ?? humanize(entityType);

/**
 * `snake_case` or `dotted.snake_case` -> "Sentence case".
 *
 * Only the first word is capitalised: "Bulk upsert", not "Bulk Upsert". Title
 * Case on a machine-derived string reads like a product name and draws the eye
 * to exactly the events nobody has written a label for yet.
 */
function humanize(raw: string): string {
  const words = raw.replace(/[._]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Verbs that carry a tone even on an action nobody has catalogued, so a future
 * `webhook.delete` still arrives red rather than grey.
 */
const FALLBACK_TONE: Array<[RegExp, AuditTone]> = [
  [/(create|add|issue|bootstrap|grant|invite)/, 'create'],
  [/(delete|remove|revoke|archive|purge)/, 'destroy'],
  [/(publish|rollback|restore|rotate)/, 'notable'],
  [/(update|change|save|set|sync|patch)/, 'update'],
];

const FALLBACK_ICON: Record<AuditTone, ComponentType<IconProps>> = {
  create: SparklesIcon,
  update: PencilIcon,
  destroy: ArchiveIcon,
  notable: UploadIcon,
  neutral: HistoryIcon,
};

/**
 * Splits `entity.verb` into its halves. Both are `[a-z0-9_]+`; anything that
 * does not match that grammar comes back with an empty verb, and the caller
 * humanises the whole string instead.
 */
export function parseAction(action: string): { entity: string; verb: string } {
  const match = /^([a-z0-9_]+)\.([a-z0-9_]+)$/.exec(action);
  if (!match) return { entity: action, verb: '' };
  return { entity: match[1]!, verb: match[2]! };
}

/** The catalog entry for an action, or one derived from its own name. */
export function auditEventMeta(action: string, entityType: string): AuditEventMeta {
  const known = CATALOG[action];
  if (known) return known;

  const { entity, verb } = parseAction(action);
  const tone = FALLBACK_TONE.find(([pattern]) => pattern.test(verb))?.[1] ?? 'neutral';
  return {
    subject: ENTITY_LABELS[entityType] ?? humanize(entity),
    verb: verb ? humanize(verb).toLowerCase() : 'recorded',
    badge: (verb || 'event').replace(/_/g, ' ').toUpperCase(),
    tone,
    icon: FALLBACK_ICON[tone],
  };
}

/**
 * The action groups the filter offers, keyed by the entity half of the action.
 *
 * Grouped rather than one row per action because 21 options in a select is a
 * list nobody reads, and "show me everything that touched a flag" is the
 * question people actually arrive with. `flag` and `tool` are one group for the
 * same reason: the server's `tool.*` and `flag.*` are both "a flag" to a user,
 * and splitting them would leak an internal naming seam onto the screen.
 */
export const ACTION_GROUPS: Array<{ id: string; label: string; entities: string[] }> = [
  { id: 'flag', label: 'Flags', entities: ['tool', 'flag'] },
  { id: 'config', label: 'Config', entities: ['config'] },
  { id: 'segment', label: 'Segments', entities: ['segment'] },
  { id: 'environment', label: 'Environments', entities: ['environment'] },
  { id: 'project', label: 'Projects', entities: ['project'] },
  { id: 'delivery', label: 'Delivery', entities: ['ruleset'] },
  { id: 'access', label: 'Access', entities: ['api_key', 'member'] },
  { id: 'org', label: 'Organization', entities: ['org'] },
];

/** Which group an action belongs to, or null when nothing claims it. */
export function actionGroup(action: string): string | null {
  const { entity } = parseAction(action);
  return ACTION_GROUPS.find((group) => group.entities.includes(entity))?.id ?? null;
}
