/**
 * One condition: attribute, operator, value, remove.
 *
 * The value control is chosen by the operator's arity rather than by a chain of
 * conditionals here, so `exists` renders no value field at all and `is one of`
 * renders chips - the shape of the form tracks the meaning of the rule. That
 * mapping lives in `operators.ts`; this file only lays the three controls out.
 *
 * ## Attributes are a combobox, not a select
 *
 * There is no attribute registry, so a closed dropdown would make a project
 * unable to target anything it had not already targeted. A text input with a
 * `<datalist>` gives the suggestion when there is one and free text when there is
 * not, using the platform's own popup - no portal, no focus management, and it
 * works on a phone.
 */
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { ProjectAttribute } from '@/api/client';
import { cn } from '@/ui/cn';
import { XIcon } from '@/ui/icons';

import { TokenInput } from './TokenInput';
import { DRAFT_ERROR_TEXT, type ConditionDraft, type DraftError } from './condition-draft';
import {
  OPERATORS,
  OPERATOR_ORDER,
  arityOf,
  coerceLiteral,
  literalTypeLabel,
  type Operator,
} from './operators';

export function ConditionRow({
  draft,
  attributes,
  error,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: {
  draft: ConditionDraft;
  attributes: ProjectAttribute[];
  error?: DraftError;
  disabled?: boolean;
  /** False for the only row in the only group - see `RuleBuilder`. */
  canRemove: boolean;
  onChange: (next: ConditionDraft) => void;
  onRemove: () => void;
}) {
  const arity = arityOf(draft.operator);
  const errorId = `${draft.id}-error`;
  const hintId = `${draft.id}-hint`;
  const listId = `${draft.id}-attributes`;

  /* Value samples for the attribute currently named, for the value field's own
     suggestions. Matched exactly: a partially typed name has no samples yet. */
  const samples = attributes.find((a) => a.name === draft.attribute.trim())?.valueSamples ?? [];

  /*
   * What the typed text will become on save, but ONLY when that is not the obvious
   * answer.
   *
   * Coercion must never be silent - typing `5` produces the number 5, and a rule
   * comparing a number against a string never fires. But announcing "Saved as text"
   * under every ordinary word is noise that trains people to stop reading the line,
   * and then the one time it says "number" they miss it. So the hint appears exactly
   * when the type is surprising: a bare number or a true/false.
   *
   * `number` operators are excluded entirely - coercion there is unconditional and
   * the field already reads as numeric, so a hint would restate the label.
   */
  const coercedRaw =
    arity === 'single' && draft.value.trim() !== '' ? coerceLiteral(draft.value.trim()) : null;
  const coerced = typeof coercedRaw === 'string' ? null : coercedRaw;

  return (
    <div className="border-border bg-panel rounded-md border p-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Field label="User attribute" htmlFor={`${draft.id}-attribute`} className="sm:flex-1">
          <Input
            id={`${draft.id}-attribute`}
            list={attributes.length > 0 ? listId : undefined}
            value={draft.attribute}
            disabled={disabled}
            placeholder="plan"
            aria-invalid={error?.kind === 'attribute' || undefined}
            aria-describedby={error ? errorId : undefined}
            className="font-mono text-[12.5px]"
            onChange={(event) => onChange({ ...draft, attribute: event.target.value })}
          />
          {attributes.length > 0 && (
            <datalist id={listId}>
              {attributes.map((attribute) => (
                <option key={attribute.name} value={attribute.name} />
              ))}
            </datalist>
          )}
        </Field>

        <Field label="Operator" htmlFor={`${draft.id}-operator`} className="sm:w-44">
          <NativeSelect
            id={`${draft.id}-operator`}
            value={draft.operator}
            disabled={disabled}
            onChange={(event) => onChange({ ...draft, operator: event.target.value as Operator })}
          >
            {OPERATOR_ORDER.map((operator) => (
              <option key={operator} value={operator}>
                {OPERATORS[operator].label}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {/*
          `exists` takes no value, so the field is absent rather than disabled: a
          greyed-out box invites you to wonder what would go in it. The draft keeps
          whatever was typed, so switching back restores it.
        */}
        {arity !== 'none' && (
          <Field label="Value" htmlFor={`${draft.id}-value`} className="sm:flex-1">
            {arity === 'multi' ? (
              <TokenInput
                id={`${draft.id}-value`}
                values={draft.values}
                suggestions={samples}
                disabled={disabled}
                invalid={error?.kind === 'values'}
                describedBy={error ? errorId : undefined}
                onChange={(values) => onChange({ ...draft, values })}
              />
            ) : (
              <>
                <Input
                  id={`${draft.id}-value`}
                  // `inputMode` rather than `type="number"`: a number input
                  // silently discards non-numeric keystrokes, so a typo becomes
                  // an empty box with no explanation. Text plus validation says
                  // what is wrong instead.
                  inputMode={arity === 'number' ? 'decimal' : undefined}
                  list={
                    arity === 'single' && samples.length > 0 ? `${draft.id}-samples` : undefined
                  }
                  value={draft.value}
                  disabled={disabled}
                  placeholder={arity === 'number' ? '5' : 'pro'}
                  aria-invalid={error?.kind === 'value' || error?.kind === 'number' || undefined}
                  aria-describedby={error ? errorId : coerced ? hintId : undefined}
                  className="font-mono text-[12.5px]"
                  onChange={(event) => onChange({ ...draft, value: event.target.value })}
                />
                {arity === 'single' && samples.length > 0 && (
                  <datalist id={`${draft.id}-samples`}>
                    {samples.map((sample) => (
                      <option key={String(sample)} value={String(sample)} />
                    ))}
                  </datalist>
                )}
              </>
            )}
          </Field>
        )}

        <div className="flex items-end sm:pt-[19px]">
          <button
            type="button"
            disabled={disabled || !canRemove}
            // Named with the attribute where there is one, so a group of rows does
            // not present a column of identically-labelled buttons.
            aria-label={
              draft.attribute.trim()
                ? `Remove condition on ${draft.attribute.trim()}`
                : 'Remove condition'
            }
            title={canRemove ? 'Remove condition' : 'A segment needs at least one condition row'}
            className={cn(
              'text-muted-foreground flex h-9 w-9 items-center justify-center rounded-md border-0 bg-transparent p-0',
              canRemove ? 'hover:text-destructive hover:bg-bg2' : 'opacity-30',
            )}
            onClick={onRemove}
          >
            <XIcon size={14} />
          </button>
        </div>
      </div>

      {error ? (
        <p id={errorId} className="text-destructive m-0 mt-1.5 text-[12px]">
          {DRAFT_ERROR_TEXT[error.kind]}
        </p>
      ) : (
        coerced !== null && (
          <p id={hintId} className="text-muted-foreground m-0 mt-1.5 text-[12px]">
            Saved as a {literalTypeLabel(coerced)} — it will not match an attribute sent as text
          </p>
        )
      )}
    </div>
  );
}

/** Label-over-control, the pairing the flag form uses, kept local to this row. */
function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
