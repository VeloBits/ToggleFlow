/**
 * The flag value-type registry - the one place a new flag type is defined.
 *
 * A flag has an on/off gate (`enabled`) and, for non-boolean types, a *value*
 * it serves while on. This module owns everything type-specific about that
 * value: how to validate it, what a new flag of the type starts as, and how to
 * render it as text. Modelled on `INHERITABLE_RESOURCES` in the API
 * (apps/api/src/lib/environment-inheritance.ts) - the shape whose promise is
 * "adding one is appending one entry".
 *
 * ## Adding a type
 *
 * Append to `FLAG_VALUE_TYPES` and fill in the `FLAG_TYPES` entry. Because
 * `FLAG_TYPES` is a `Record<FlagValueType, …>`, the second step is a compile
 * error until it is done - the registry cannot be half-extended. Then:
 *
 *   - `apps/api/drizzle/000N_*.sql`: `ALTER TYPE flag_value_type ADD VALUE …`
 *     (drizzle-kit generates it; the pgEnum reads `FLAG_VALUE_TYPES`, so the
 *     Drizzle schema needs no edit)
 *   - `apps/dashboard/src/features/flags/value-controls.tsx`: the render half,
 *     also an exhaustive `Record`, also a compile error until filled
 *
 * Nothing else. Not the evaluator, not the route validators, not the list page,
 * not the form. That is the whole point of the indirection.
 *
 * Why the render half lives in the dashboard rather than here: this package is
 * runtime-agnostic by contract (see index.ts) and runs inside workerd, so it
 * cannot hold React components.
 */
import { z } from 'zod';

/*
 * Type-only import, and it must stay that way: schema.ts imports
 * `flagValueTypeSchema` from here at module-evaluation time to build
 * `snapshotToolSchema`. A *value* import back the other way would close a
 * runtime cycle and leave one of the two zod schemas half-built depending on
 * which module the bundler evaluates first. `verbatimModuleSyntax` erases
 * this line, so the dependency is one-directional at runtime.
 */
import type { JsonValue } from './schema';

/**
 * Ordered as the dashboard's type picker lists them: simplest first. The tuple
 * is `as const` because the API's pgEnum is generated from it, so this array is
 * the single source of truth for the DB enum, the wire enum and the TS union.
 */
export const FLAG_VALUE_TYPES = ['boolean', 'string', 'string_enum'] as const;

export type FlagValueType = (typeof FLAG_VALUE_TYPES)[number];

export const flagValueTypeSchema = z.enum(FLAG_VALUE_TYPES);

/**
 * The type-specific constraints carried by a flag *definition*. A future
 * `number` type would add `min`/`max` here; a `json` type, a schema reference.
 */
export interface FlagConstraints {
  /** Allowed members, for types where the value's domain is a fixed set. */
  enumOptions: string[];
}

export interface FlagTypeDescriptor {
  type: FlagValueType;
  /** Type-picker option and type-badge text. */
  label: string;
  /** One line under the type picker, explaining when to reach for it. */
  hint: string;
  /**
   * True when the served value IS `enabled` and nothing is stored separately.
   * Boolean flags set this; it is why `flag_states.value` is nullable and why
   * a PATCH carrying a `value` for a boolean flag is rejected rather than
   * silently ignored.
   */
  derivesFromEnabled: boolean;
  /** True when a definition of this type is invalid without `enumOptions`. */
  requiresOptions: boolean;
  /**
   * Validates a served value - a `flag_states.value` or a targeting rule's
   * value. Takes the definition's constraints because for `string_enum` the
   * valid set is per-flag, which is exactly why the API cannot validate a
   * flag PATCH from a static body schema alone.
   */
  valueSchema: (constraints: FlagConstraints) => z.ZodType<JsonValue>;
  /** The value a newly created flag of this type gets when none is supplied. */
  initialValue: (constraints: FlagConstraints) => JsonValue;
  /** Human-readable rendering for table cells and audit entries. Never throws. */
  format: (value: JsonValue | null) => string;
}

const booleanType: FlagTypeDescriptor = {
  type: 'boolean',
  label: 'Boolean',
  hint: 'On or off. The classic feature flag and kill switch.',
  derivesFromEnabled: true,
  requiresOptions: false,
  valueSchema: () => z.boolean(),
  initialValue: () => false,
  format: (value) => (value === true ? 'true' : 'false'),
};

const stringType: FlagTypeDescriptor = {
  type: 'string',
  label: 'String',
  hint: 'Any text - a message, a URL, a model name. Free-form.',
  derivesFromEnabled: false,
  requiresOptions: false,
  // 10k is generous for a config string and stops a flag becoming a document
  // store; the snapshot is fetched on every cold SDK start.
  valueSchema: () => z.string().max(10_000),
  initialValue: () => '',
  format: (value) => (typeof value === 'string' ? value : String(value ?? '')),
};

const stringEnumType: FlagTypeDescriptor = {
  type: 'string_enum',
  label: 'String (choice)',
  hint: 'Text limited to a fixed set of options you define.',
  derivesFromEnabled: false,
  requiresOptions: true,
  /*
   * Built per-flag from the definition's options rather than as a z.enum, so
   * the error message names the legal members - "expected one of fast,
   * balanced, quality" is actionable where "invalid enum value" is not.
   *
   * An empty option list would make z.enum([]) reject everything with an
   * opaque message; the definition-level CHECK constraint and the route
   * validator both forbid that state, and this falls back to a clear message
   * if one is ever reached anyway.
   */
  valueSchema: ({ enumOptions }) =>
    z.string().refine((value) => enumOptions.includes(value), {
      message:
        enumOptions.length > 0
          ? `expected one of: ${enumOptions.join(', ')}`
          : 'this flag has no options defined yet',
    }),
  initialValue: ({ enumOptions }) => enumOptions[0] ?? '',
  format: (value) => (typeof value === 'string' ? value : String(value ?? '')),
};

export const FLAG_TYPES: Record<FlagValueType, FlagTypeDescriptor> = {
  boolean: booleanType,
  string: stringType,
  string_enum: stringEnumType,
};

/**
 * Look up a descriptor, degrading unknown types to `boolean`.
 *
 * Deliberately total rather than throwing: an older evaluator can meet a
 * snapshot written by a newer control plane (that is the additive-field
 * contract), and a flag whose type it has never heard of must still evaluate
 * on/off rather than take the SDK down. The dashboard and the API validate
 * against `FLAG_VALUE_TYPES` up front, so a bad type never reaches storage.
 */
export function flagType(type: string): FlagTypeDescriptor {
  return FLAG_TYPES[type as FlagValueType] ?? booleanType;
}

export interface ResolveValueInput {
  valueType: FlagValueType;
  /** Whether the flag is serving its on-value, after all rules have run. */
  enabled: boolean;
  /** The environment's stored value (`flag_states.value`); null = inherit. */
  value: JsonValue | null;
  /** The definition's default (`tools.default_value`). */
  defaultValue: JsonValue | null;
  /** `config.fallback` - what an off flag serves. */
  fallback: JsonValue | null;
}

/**
 * The single definition of "what does this flag serve right now", shared by the
 * evaluator, the API's audit entries and the dashboard's value cell - so the
 * number a developer reads in the UI is computed by the same code that serves
 * their users.
 *
 * For a boolean flag the value IS `enabled`. For every other type: on serves
 * the environment's value (falling back to the definition default), and off
 * serves `config.fallback` - the convention documented on `snapshotToolSchema`
 * and exercised by fixtures/config-fallback.json. `null` when there is no
 * fallback, which is a legal served value, not an error.
 */
export function resolveValue({
  valueType,
  enabled,
  value,
  defaultValue,
  fallback,
}: ResolveValueInput): JsonValue | null {
  if (flagType(valueType).derivesFromEnabled) return enabled;
  if (!enabled) return fallback;
  return value ?? defaultValue;
}

/** Narrowing guard for values arriving from JSON. */
export function isFlagValueType(value: unknown): value is FlagValueType {
  return flagValueTypeSchema.safeParse(value).success;
}
