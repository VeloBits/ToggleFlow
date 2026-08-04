/**
 * Validation and state for the create/edit flag form.
 *
 * ## Why not react-hook-form
 *
 * Four reasons, in order of weight:
 *
 *  1. The dashboard's coverage floor (92/90/92/94, with roughly ten functions of
 *     headroom) cannot absorb an untested second form idiom. RHF plus
 *     `@hookform/resolvers` is a dependency graph whose uncovered arms would eat
 *     the entire remaining budget.
 *  2. The test kit is `fireEvent` with no `user-event` and no `jest-dom`. RHF's
 *     uncontrolled refs and `shouldFocusError` fight both `fireEvent.change` and
 *     Radix's FocusScope (see `src/ui/dialog.tsx`). A controlled value is one
 *     `fireEvent.change` away.
 *  3. Six fields and one array. RHF earns its keep at twenty-plus with
 *     cross-field `watch`; here `useState` plus one `safeParse` is less code.
 *  4. `CreateScopeDialogs.tsx` already solved this shape well - the `Form`
 *     wrapper that makes Enter submit, `useSubmit` for pending/error, and the
 *     slug latch. Reusing it is continuity.
 *
 * `useFlagForm` is the seam. When this form grows variations, prerequisites or
 * per-environment defaults, replace the hook's internals with RHF and no
 * consumer changes.
 */
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { FLAG_TYPES, flagValueTypeSchema, type FlagValueType } from '@toggleflow/engine';

import { FLAG_KEY_PATTERN, slugifyFlagKey } from '@/ui/slug';

const enumOption = z.string().trim().min(1, 'Options cannot be blank').max(200);

const base = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  key: z
    .string()
    .min(1, 'Key is required')
    .max(200)
    .regex(
      FLAG_KEY_PATTERN,
      'Lowercase letters, digits, dots, dashes and underscores only, starting with a letter or digit.',
    ),
  description: z.string().trim().max(2000),
  tags: z.array(z.string().trim().min(1).max(50)).max(50),
});

/**
 * A discriminated union on `valueType`, so the fields a type does not have
 * cannot be submitted and the type-specific `defaultValue` is checked as the
 * right primitive rather than as `unknown`.
 */
export const flagFormSchema = z
  .discriminatedUnion('valueType', [
    base.extend({ valueType: z.literal('boolean'), defaultValue: z.boolean() }),
    base.extend({
      valueType: z.literal('string'),
      defaultValue: z.string().max(10_000, 'Keep default values under 10,000 characters'),
    }),
    base.extend({
      valueType: z.literal('string_enum'),
      enumOptions: z.array(enumOption).min(1, 'Add at least one option').max(200),
      defaultValue: z.string().min(1, 'Pick a default option'),
    }),
  ])
  /*
   * The cross-field checks live in `superRefine` on the UNION rather than
   * `.refine` on the `string_enum` member: a refined object is not reliably
   * accepted as a discriminatedUnion member, and keeping them here leaves the
   * discriminator statically resolvable (which is what gives the narrowing in
   * the form component).
   */
  .superRefine((values, ctx) => {
    if (values.valueType !== 'string_enum') return;

    const seen = new Set<string>();
    values.enumOptions.forEach((option, index) => {
      if (seen.has(option)) {
        ctx.addIssue({
          code: 'custom',
          path: ['enumOptions', index],
          message: 'Duplicate option',
        });
      }
      seen.add(option);
    });

    if (!values.enumOptions.includes(values.defaultValue)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'The default must be one of the options',
      });
    }
  });

export type FlagFormValues = z.infer<typeof flagFormSchema>;

/** The mutable shape the inputs bind to - a superset of every member's fields. */
export interface FlagFormState {
  name: string;
  key: string;
  description: string;
  tags: string;
  valueType: FlagValueType;
  enumOptions: string[];
  /** Held per type so switching type and back does not silently lose what was typed. */
  booleanDefault: boolean;
  stringDefault: string;
  enumDefault: string;
}

export const EMPTY_FLAG_FORM: FlagFormState = {
  name: '',
  key: '',
  description: '',
  tags: '',
  valueType: 'boolean',
  enumOptions: [''],
  booleanDefault: false,
  stringDefault: '',
  enumDefault: '',
};

/** Flatten zod issues to one message per field path, first one winning. */
export function issuesByPath(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

function defaultValueFor(state: FlagFormState): boolean | string {
  if (state.valueType === 'boolean') return state.booleanDefault;
  if (state.valueType === 'string') return state.stringDefault;
  return state.enumDefault;
}

/** Normalise the raw input state into the shape the schema validates. */
function toValues(state: FlagFormState, effectiveKey: string): unknown {
  const shared = {
    name: state.name,
    key: effectiveKey,
    description: state.description,
    tags: state.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    valueType: state.valueType,
    defaultValue: defaultValueFor(state),
  };
  return state.valueType === 'string_enum'
    ? { ...shared, enumOptions: state.enumOptions.map((option) => option.trim()).filter(Boolean) }
    : shared;
}

export interface UseFlagFormOptions {
  mode: 'create' | 'edit';
  initial?: Partial<FlagFormState>;
}

export function useFlagForm({ mode, initial }: UseFlagFormOptions) {
  const [state, setState] = useState<FlagFormState>({ ...EMPTY_FLAG_FORM, ...initial });
  /*
   * Latch, not a comparison: once the user has touched Key it stops following
   * Name, even if they later clear it. Same rule as
   * CreateScopeDialogs.tsx's environment-key field. In edit mode the key is
   * fixed and shown disabled, so the latch starts closed.
   */
  const [keyEdited, setKeyEdited] = useState(mode === 'edit');
  /** Errors appear only after a submit attempt - typing a name should not scold. */
  const [submitted, setSubmitted] = useState(false);

  const effectiveKey = keyEdited ? state.key : slugifyFlagKey(state.name);

  const parsed = useMemo(
    () => flagFormSchema.safeParse(toValues(state, effectiveKey)),
    [state, effectiveKey],
  );

  const errors = submitted && !parsed.success ? issuesByPath(parsed.error) : {};

  const setField = <K extends keyof FlagFormState>(field: K, value: FlagFormState[K]) => {
    setState((current) => {
      const next = { ...current, [field]: value };
      // Removing or renaming the option that was the default would leave an
      // orphan; clear it so the "pick a default" error surfaces instead.
      if (field === 'enumOptions' && !(value as string[]).includes(current.enumDefault)) {
        next.enumDefault = '';
      }
      return next;
    });
  };

  return {
    state,
    setField,
    effectiveKey,
    keyEdited,
    /** Called by the Key input's onChange - opens the latch on first keystroke. */
    editKey: (value: string) => {
      setKeyEdited(true);
      setField('key', value);
    },
    errors,
    parsed,
    typeHint: FLAG_TYPES[state.valueType].hint,
    attemptSubmit: () => {
      setSubmitted(true);
      return parsed.success ? parsed.data : null;
    },
  };
}

/**
 * Map validated form values onto the API's request body, dropping the fields a
 * type does not own so the server never has to guess whether an absent
 * `enumOptions` means "empty" or "not applicable".
 */
export function toCreateBody(values: FlagFormValues) {
  return {
    key: values.key,
    name: values.name,
    description: values.description || null,
    tags: values.tags,
    valueType: values.valueType,
    ...(values.valueType === 'string_enum' ? { enumOptions: values.enumOptions } : {}),
    // A boolean flag stores no value: its value IS `enabled`, which is why the
    // API rejects a `defaultValue` for it rather than ignoring one.
    ...(values.valueType === 'boolean' ? {} : { defaultValue: values.defaultValue }),
  };
}

/** Edit sends only what is mutable: never `key`, never `valueType`. */
export function toPatchBody(values: FlagFormValues) {
  return {
    name: values.name,
    description: values.description || null,
    tags: values.tags,
    ...(values.valueType === 'string_enum' ? { enumOptions: values.enumOptions } : {}),
    ...(values.valueType === 'boolean' ? {} : { defaultValue: values.defaultValue }),
  };
}

export { flagValueTypeSchema };
