/**
 * A labelled JSON textarea whose validation belongs to whoever renders it.
 *
 * Lifted out of `FlagDetailPage` when that page grew tabs: the state tab's
 * targeting rules and the config tab's payload are the same control against two
 * different schemas, and the two panels no longer share a module to hide a local
 * helper in.
 *
 * The schema stays outside on purpose. Both callers parse on *save*, not on
 * every keystroke, because a half-typed object is invalid for as long as it
 * takes to type one - a field that flashes red mid-word teaches people to stop
 * reading it. So this component owns no schema, no draft and no error state: it
 * renders a string, reports edits, and shows whatever the last save complained
 * about.
 *
 * `hint` is required rather than optional, and the hint and the error share one
 * slot. A JSON blob with no explanation of its shape is a guessing game, and
 * stacking the hint above the error makes the box grow and shrink as you type.
 */
import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
  /** What shape this blob should be. Replaced by `error` while there is one. */
  hint: ReactNode;
  disabled?: boolean;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        // Autocorrect on a JSON payload turns quotes into typography and breaks
        // the parse in a way that is invisible in a monospace font.
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
        className="min-h-40 font-mono text-[12.5px] leading-relaxed"
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className="text-destructive m-0 text-[12px]">
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-muted-foreground m-0 text-[12px]">
          {hint}
        </p>
      )}
    </div>
  );
}
