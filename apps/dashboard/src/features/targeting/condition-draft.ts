/**
 * The editable shape of a condition, and its conversion to and from the engine's
 * `Condition`.
 *
 * ## Why a draft type exists at all
 *
 * `Condition` is a discriminated union whose value field MOVES with the operator:
 * `eq` carries `value`, `in` carries `values`, `exists` carries neither. Editing
 * the union directly means every operator change destroys a field, so switching
 * `is` → `is one of` → `is` loses what was typed both ways. The draft holds both
 * fields at once and lets the operator decide which one is read.
 *
 * It also holds text rather than scalars. A half-typed `-` is not a number, and a
 * controlled number input that rejects it cannot be typed into; keeping the raw
 * string means the field always shows what was pressed, and coercion happens once
 * at the boundary (`toCondition`).
 *
 * ## Incomplete is not invalid
 *
 * A fresh condition has no attribute yet, and a rule being built is normal rather
 * than erroneous. So `toCondition` returns null for "not finished", the builder
 * drops nulls when it saves, and only genuinely contradictory input (a numeric
 * comparison against `abc`) is reported as an error. That keeps the form quiet
 * while someone is typing and loud only when they are wrong.
 */
import type { AttributeValue, Condition } from '@toggleflow/engine';

import { arityOf, coerceLiteral, type Operator } from './operators';

export interface ConditionDraft {
  /**
   * Identity for React's key and for targeted updates. Not persisted - a
   * condition has no server-side identity, it is a position in an array.
   */
  id: string;
  attribute: string;
  operator: Operator;
  /** Raw text for `single`/`number` operators. */
  value: string;
  /** Raw text per chip for `multi` operators. */
  values: string[];
}

export interface RuleSetDraft {
  id: string;
  conditions: ConditionDraft[];
}

/*
 * A module-level counter, not `crypto.randomUUID()`. These ids never leave the
 * browser and never reach a request, so uniqueness within one page load is the
 * whole requirement - and a counter keeps test snapshots stable, which a random
 * id would not.
 */
let seq = 0;
const nextId = () => `d${++seq}`;

export function emptyCondition(): ConditionDraft {
  return { id: nextId(), attribute: '', operator: 'eq', value: '', values: [] };
}

export function emptyRuleSet(): RuleSetDraft {
  return { id: nextId(), conditions: [emptyCondition()] };
}

/** Server shape → draft. The inverse of `toCondition`, minus the raw text. */
export function toDraft(condition: Condition): ConditionDraft {
  const base = { id: nextId(), attribute: condition.attribute, operator: condition.operator };
  if (condition.operator === 'in' || condition.operator === 'notIn') {
    return { ...base, value: '', values: condition.values.map(String) };
  }
  if (condition.operator === 'exists') return { ...base, value: '', values: [] };
  return { ...base, value: String(condition.value), values: [] };
}

export function toRuleSetDrafts(rules: Condition[][]): RuleSetDraft[] {
  const sets = rules.map((conditions) => ({
    id: nextId(),
    conditions: conditions.map(toDraft),
  }));
  // The builder always renders at least one group with at least one row, so a
  // segment stored as `[]` or `[[]]` still has something to type into.
  if (sets.length === 0) return [emptyRuleSet()];
  return sets.map((set) =>
    set.conditions.length === 0 ? { ...set, conditions: [emptyCondition()] } : set,
  );
}

/** Nothing typed yet - dropped on save rather than reported as an error. */
export function isBlank(draft: ConditionDraft): boolean {
  return (
    draft.attribute.trim() === '' &&
    draft.value.trim() === '' &&
    draft.values.every((v) => v.trim() === '')
  );
}

export type DraftError =
  { kind: 'attribute' } | { kind: 'value' } | { kind: 'number' } | { kind: 'values' };

/**
 * Draft → `Condition`, or the reason it cannot be one yet.
 *
 * Returns `{ condition }` when complete, `{ error }` when contradictory, and
 * `{}` when merely unfinished (see the docblock above).
 */
export function convertCondition(draft: ConditionDraft): {
  condition?: Condition;
  error?: DraftError;
} {
  if (isBlank(draft)) return {};

  const attribute = draft.attribute.trim();
  if (attribute === '') return { error: { kind: 'attribute' } };

  const arity = arityOf(draft.operator);

  if (arity === 'none') return { condition: { attribute, operator: 'exists' } };

  if (arity === 'multi') {
    const values = draft.values.map((v) => v.trim()).filter((v) => v !== '');
    if (values.length === 0) return { error: { kind: 'values' } };
    return {
      condition: {
        attribute,
        operator: draft.operator as 'in' | 'notIn',
        values: values.map(coerceLiteral),
      },
    };
  }

  const raw = draft.value.trim();
  if (raw === '') return { error: { kind: 'value' } };

  if (arity === 'number') {
    const numeric = Number(raw);
    // `Number('')` is 0 and `Number(' ')` is 0, both already excluded above.
    if (!Number.isFinite(numeric)) return { error: { kind: 'number' } };
    return {
      condition: {
        attribute,
        operator: draft.operator as 'gt' | 'gte' | 'lt' | 'lte',
        value: numeric,
      },
    };
  }

  return {
    condition: {
      attribute,
      operator: draft.operator as 'eq' | 'neq',
      value: coerceLiteral(raw) as AttributeValue,
    },
  };
}

export interface ConvertedRules {
  /** Groups with their blank rows dropped; safe to send. */
  rules: Condition[][];
  /** Keyed by draft id, so each row can show its own message. */
  errors: Record<string, DraftError>;
}

/**
 * Converts every group, collecting per-row errors rather than failing at the
 * first one - a form that reports one problem at a time makes you submit N times
 * to find N problems.
 *
 * Groups that end up empty are dropped, since an empty AND-group matches
 * everyone and under `any` that would silently widen the segment to the whole
 * world. `buildSegmentEntry` drops them server-side too; doing it here as well is
 * what lets the UI warn about it before saving rather than after.
 */
export function convertRuleSets(sets: RuleSetDraft[]): ConvertedRules {
  const rules: Condition[][] = [];
  const errors: Record<string, DraftError> = {};

  for (const set of sets) {
    const group: Condition[] = [];
    for (const draft of set.conditions) {
      const { condition, error } = convertCondition(draft);
      if (error) errors[draft.id] = error;
      else if (condition) group.push(condition);
    }
    if (group.length > 0) rules.push(group);
  }

  return { rules, errors };
}

export const DRAFT_ERROR_TEXT: Record<DraftError['kind'], string> = {
  attribute: 'Pick an attribute.',
  value: 'Enter a value.',
  values: 'Add at least one value.',
  number: 'This operator needs a number.',
};
