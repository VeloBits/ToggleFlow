/**
 * The operator registry: one entry per engine operator, holding the plain-English
 * label and the SHAPE of the value it takes.
 *
 * This file exists so nothing else has to switch on the operator. The value
 * field, the read-only summary and the draft→`Condition` conversion all ask the
 * registry what kind of input an operator wants, which is what lets a tenth
 * operator be one entry here rather than an edit in four components - the same
 * indirection `FLAG_TYPES` gives flag value types.
 *
 * Labels are written for someone who has never read the engine: `in` reads as
 * "is one of", `exists` as "is present". The engine's names never reach the
 * screen, only this column does.
 */
import type { AttributeValue, Condition } from '@toggleflow/engine';

/** What kind of value input an operator needs. */
export type ValueArity =
  /** One literal: eq, neq. */
  | 'single'
  /** One number: gt, gte, lt, lte. */
  | 'number'
  /** A list of literals: in, notIn. */
  | 'multi'
  /** No value at all: exists. */
  | 'none';

export type Operator = Condition['operator'];

export interface OperatorDescriptor {
  /** What the picker shows. */
  label: string;
  arity: ValueArity;
}

/**
 * A `Record` over the operator union, so adding an operator to the engine is a
 * compile error here until it is described - the registry cannot be
 * half-extended.
 *
 * Ordered as the picker lists them: equality first because it is what most rules
 * want, then membership, then the numeric comparisons, then presence.
 */
export const OPERATORS: Record<Operator, OperatorDescriptor> = {
  eq: { label: 'is', arity: 'single' },
  neq: { label: 'is not', arity: 'single' },
  in: { label: 'is one of', arity: 'multi' },
  notIn: { label: 'is not one of', arity: 'multi' },
  gt: { label: 'is greater than', arity: 'number' },
  gte: { label: 'is at least', arity: 'number' },
  lt: { label: 'is less than', arity: 'number' },
  lte: { label: 'is at most', arity: 'number' },
  exists: { label: 'is present', arity: 'none' },
};

/** Picker order - `Object.keys` order is not a contract worth relying on. */
export const OPERATOR_ORDER: Operator[] = [
  'eq',
  'neq',
  'in',
  'notIn',
  'gt',
  'gte',
  'lt',
  'lte',
  'exists',
];

export const arityOf = (operator: Operator): ValueArity => OPERATORS[operator].arity;

/**
 * Turns typed text into the scalar an SDK would actually send.
 *
 * ## Why coerce at all
 *
 * The engine compares with `===`, and a user context carries real
 * `string | number | boolean` values. If someone types `5` for `seats` and the
 * SDK sends the number 5, storing the string `"5"` produces a rule that looks
 * right and never matches. Coercion is not a convenience here, it is the
 * difference between a working rule and a silent one.
 *
 * ## Why the round-trip test
 *
 * `Number('1.0')` is 1, so a naive coercion turns the version string `"1.0"`
 * into the number 1 - another rule that silently never matches, caused by the
 * fix for the first one. Requiring `String(Number(raw)) === raw` accepts `5`,
 * `-2` and `3.5` while leaving `1.0`, `007` and `1e3` as the strings they were
 * typed as. Exactness is the whole test: if the number cannot be written back
 * character-for-character, it was never a number.
 *
 * Booleans are exact-match only, so a plan literally called `True` survives.
 */
export function coerceLiteral(raw: string): AttributeValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && String(Number(raw)) === raw) return Number(raw);
  return raw;
}

/** How a coerced literal is described to the user, so coercion is never silent. */
export function literalTypeLabel(value: AttributeValue): string {
  return typeof value === 'string' ? 'text' : typeof value === 'number' ? 'number' : 'true/false';
}

/** Renders a literal for display; strings are shown bare, not quoted. */
export const formatLiteral = (value: AttributeValue): string => String(value);
