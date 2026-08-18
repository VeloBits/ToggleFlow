/**
 * A labelled JSON textarea whose validation belongs to whoever renders it.
 *
 * Lifted out of `FlagDetailPage` when that page grew tabs: the state tab's
 * targeting rules and the config tab's payload are the same control against two
 * different schemas, and the two panels no longer share a module to hide a local
 * helper in.
 *
 * The schema stays outside on purpose. Both callers parse on *save*, not on every
 * keystroke, because a half-typed object is invalid for as long as it takes to
 * type one — a field that flashes red mid-word teaches people to stop reading it.
 * So this component owns no schema, no draft and no error state: it renders a
 * string, reports edits, and shows whatever the last save complained about.
 *
 * ## The hint and the error now stack, where they used to share one slot
 *
 * The previous version swapped the hint out for the error, to stop the box
 * growing and shrinking as you type. `Field` from the design system takes the
 * opposite position and is right: `aria-describedby` is assembled before children
 * render, so a description that comes and goes leaves the control pointing at an
 * element that does not exist — a dangling reference, which several screen
 * readers resolve by announcing nothing at all, including the error. Losing the
 * format hint at the exact moment the format is wrong is also the worse of the
 * two outcomes for a sighted user.
 *
 * Both are now always present, error first (the failure matters more than the
 * hint, and a screen reader announces `aria-describedby` in order). The layout
 * shift that motivated the swap is a single 12px line.
 */
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Textarea,
} from '@velobits-dev/ui';
import type { ReactNode } from 'react';

export function JsonField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** The last save's complaint, or null. Produced by the caller's schema. */
  error: string | null;
  /** What shape this blob should be. */
  hint: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field id={id} error={error}>
      <FieldLabel>{label}</FieldLabel>
      {/*
       * `FieldControl` is what wires `id`, `aria-invalid` and the composed
       * `aria-describedby` onto the child — via `Slot`, so the Textarea below
       * needs none of them spelled out.
       */}
      <FieldControl>
        <Textarea
          value={value}
          disabled={disabled}
          // Autocorrect on a JSON payload turns quotes into typography and breaks
          // the parse in a way that is invisible in a monospace font.
          spellCheck={false}
          className="min-h-40 font-mono text-[12.5px] leading-relaxed"
          onChange={(event) => onChange(event.target.value)}
        />
      </FieldControl>
      <FieldError>{error}</FieldError>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  );
}
