/**
 * Type-aware validation for flag values.
 *
 * Two routes need it and they need different halves: routes/tools.ts validates
 * a flag DEFINITION (its type, its option list, its default), routes/flags.ts
 * validates a value an environment would SERVE. Both delegate every actual rule
 * to the engine's `FLAG_TYPES` registry, so adding a flag type touches
 * packages/engine/src/flag-types.ts and nothing here.
 *
 * Why this cannot be done with a static zod body schema alone: for
 * `string_enum` the set of legal values is a property of the flag row, so the
 * schema that validates a value only exists once the flag has been loaded. That
 * is the two-stage shape every caller here follows - parse the body for shape,
 * then validate the value against the definition.
 */
import {
  flagType,
  flagValueTypeSchema,
  jsonValueSchema,
  type FlagValueType,
  type JsonValue,
} from '@toggleflow/engine';
import { z } from 'zod';

import { badRequest } from './errors';

/** 200 chars is a generous enum member; longer belongs in a free-form `string` flag. */
const enumOption = z.string().min(1).max(200);

/**
 * The definition fields, shared verbatim by tool create and the bulk-sync
 * manifest entries so the CLI and the dashboard cannot diverge on what a valid
 * flag definition looks like.
 */
export const flagDefinitionFields = {
  valueType: flagValueTypeSchema.default('boolean'),
  enumOptions: z.array(enumOption).max(200).default([]),
  defaultValue: jsonValueSchema.optional(),
};

/** The mutable subset - `valueType` is absent by design (see routes/tools.ts). */
export const flagDefinitionPatchFields = {
  enumOptions: z.array(enumOption).max(200),
  defaultValue: jsonValueSchema,
};

/**
 * The bulk-manifest variant: nothing is defaulted, so "omitted" stays
 * distinguishable from "declared as boolean with no options".
 *
 * That distinction is the whole point. A CLI manifest written before typed flags
 * existed lists key + name only; if the defaults applied, syncing it would read
 * as "reset every flag to boolean and clear its options" - which the
 * immutability guard would then reject, leaving the CLI unable to rename a typed
 * flag. Omission has to mean "no opinion".
 */
export const flagManifestFields = {
  valueType: flagValueTypeSchema.optional(),
  enumOptions: z.array(enumOption).max(200).optional(),
  defaultValue: jsonValueSchema.optional(),
};

export interface FlagDefinitionInput {
  valueType: FlagValueType;
  enumOptions: string[];
  defaultValue?: JsonValue;
}

export interface FlagDefinitionColumns {
  valueType: FlagValueType;
  enumOptions: string[];
  defaultValue: JsonValue | null;
}

/** Rejects an option list with repeats - a duplicate member is always a mistake. */
export function assertUniqueOptions(options: string[]): void {
  const seen = new Set(options);
  if (seen.size !== options.length) {
    const dupes = options.filter((o, i) => options.indexOf(o) !== i);
    throw badRequest(`duplicate enum options: ${[...new Set(dupes)].join(', ')}`);
  }
}

/**
 * Validates a proposed definition and returns the columns to store.
 *
 * `defaultValue` is forced to null for types whose value derives from `enabled`
 * (boolean), so a boolean flag never carries a second, contradictory source of
 * truth for what it serves. For every other type an omitted default becomes the
 * type's `initialValue`, because "on but no value" is not a state the SDK can
 * serve anything sensible for.
 *
 * Throws HttpError(400) for structural problems and ZodError (also 400, as
 * `validation_error`) when the default does not fit the type.
 */
export function validateFlagDefinition(input: FlagDefinitionInput): FlagDefinitionColumns {
  const descriptor = flagType(input.valueType);
  const constraints = { enumOptions: input.enumOptions };
  if (descriptor.requiresOptions && constraints.enumOptions.length === 0) {
    throw badRequest('string_enum flags need at least one option');
  }
  assertUniqueOptions(constraints.enumOptions);
  return {
    valueType: input.valueType,
    enumOptions: input.enumOptions,
    defaultValue: descriptor.derivesFromEnabled
      ? null
      : descriptor
          .valueSchema(constraints)
          .parse(input.defaultValue ?? descriptor.initialValue(constraints)),
  };
}

/**
 * Validates a value a flag would serve - a `flag_states.value` or a targeting
 * rule's value - against the flag's own type. Throws ZodError so server.ts maps
 * it to 400 `validation_error` with the descriptor's message, which for an enum
 * lists the legal members.
 */
export function parseServedValue(
  definition: { valueType: FlagValueType; enumOptions: string[] },
  value: unknown,
): JsonValue {
  return flagType(definition.valueType)
    .valueSchema({ enumOptions: definition.enumOptions })
    .parse(value);
}

/** The values explicitly carried by stored targeting rules (jsonb, so `unknown[]`). */
export function targetingRuleValues(rules: unknown): JsonValue[] {
  if (!Array.isArray(rules)) return [];
  const values: JsonValue[] = [];
  for (const rule of rules) {
    if (rule === null || typeof rule !== 'object') continue;
    const value = (rule as { value?: unknown }).value;
    if (value !== undefined) values.push(value as JsonValue);
  }
  return values;
}

export interface EnvironmentFlagValues {
  environmentKey: string;
  value: JsonValue | null;
  targetingRules: unknown[];
}

/**
 * Guards an edit to a flag's option list.
 *
 * Adding options is always safe, so the common case short-circuits. REMOVING an
 * option that an environment - or one of its targeting rules - currently serves
 * would leave that environment serving a value the definition no longer allows:
 * the dashboard would render it as if it were fine and the SDK would hand it to
 * a call site that has since dropped the case. Refused, naming what blocks it,
 * which is the difference between an option list that is safe to edit and one
 * that silently starts serving an invalid member.
 */
export function assertOptionRemovalSafe(input: {
  currentOptions: string[];
  nextOptions: string[];
  defaultValue: JsonValue | null;
  states: EnvironmentFlagValues[];
}): void {
  const allowed = new Set(input.nextOptions);
  if (input.currentOptions.every((option) => allowed.has(option))) return;

  const orphaned = (value: JsonValue | null) => typeof value === 'string' && !allowed.has(value);
  const blockers = input.states
    .filter((state) => [state.value, ...targetingRuleValues(state.targetingRules)].some(orphaned))
    .map((state) => `environment "${state.environmentKey}"`);
  if (orphaned(input.defaultValue)) blockers.unshift("the flag's default value");
  if (blockers.length === 0) return;

  const removed = input.currentOptions.filter((option) => !allowed.has(option));
  throw badRequest(
    `cannot remove option(s) ${removed.join(', ')}: still in use by ${blockers.join(', ')}`,
  );
}
