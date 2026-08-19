/**
 * The chip field for `is one of` / `is not one of`.
 *
 * A list operator against a free-text box means someone has to guess the
 * separator, and whichever they guess ("pro, team" / "pro,team" / "pro team")
 * one of them is wrong. Chips make the boundary between values visible, which is
 * the entire reason this is not an `<input>` with a `split(',')`.
 *
 * ## Committing
 *
 * Enter and comma both commit, because both are what people reach for. Blur
 * commits too: text sitting uncommitted in the box when the form is submitted
 * looks exactly like a value that was entered, and losing it silently is worse
 * than accepting one the user might not have finished typing.
 *
 * Backspace on an empty box removes the last chip - the behaviour every tag
 * input has, and the only way to correct a typo without reaching for the mouse.
 */
import { useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '@/ui/cn';
import { XIcon } from '@/ui/icons';

export function TokenInput({
  id,
  values,
  onChange,
  suggestions = [],
  invalid,
  describedBy,
  disabled,
  placeholder = 'Add a value…',
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  /** Literals this attribute has been compared against elsewhere in the project. */
  suggestions?: (string | number | boolean)[];
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const value = raw.trim();
    setText('');
    // Silently ignored rather than flagged: a duplicate in an OR-of-equals
    // changes nothing, so refusing it with an error would be noise.
    if (value === '' || values.includes(value)) return;
    onChange([...values, value]);
  };

  const removeAt = (index: number) => onChange(values.filter((_, i) => i !== index));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      // Enter must not submit the surrounding form while a chip is half-typed.
      event.preventDefault();
      commit(text);
      return;
    }
    if (event.key === 'Backspace' && text === '' && values.length > 0) {
      event.preventDefault();
      removeAt(values.length - 1);
    }
  };

  const unused = suggestions.map(String).filter((s) => !values.includes(s));
  const listId = `${id}-suggestions`;

  return (
    <div className="flex flex-col gap-1">
      {/*
        The frame is the control: clicking anywhere in it focuses the real input,
        so the chips and the text behave as one field. `focus-within` carries the
        ring, since the <div> itself is never focused.
      */}
      <div
        className={cn(
          'border-input bg-bg flex min-h-9 flex-wrap items-center gap-1 rounded-md border px-2 py-1.5',
          'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
          invalid && 'border-destructive',
          disabled && 'opacity-50',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className="bg-bg2 text-text inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[12px]"
          >
            {value}
            <button
              type="button"
              disabled={disabled}
              // The chip carries its own name so the button reads as "Remove pro"
              // rather than nine identical "Remove" buttons.
              aria-label={`Remove ${value}`}
              className="text-muted-foreground hover:text-text flex items-center border-0 bg-transparent p-0"
              onClick={(event) => {
                event.stopPropagation();
                removeAt(index);
              }}
            >
              <XIcon size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={text}
          disabled={disabled}
          list={unused.length > 0 ? listId : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder={values.length === 0 ? placeholder : undefined}
          /*
           * `min-w-0 flex-1` lets the text box shrink to nothing once chips fill
           * the row, so chips wrap instead of the input being pushed out of the
           * frame. `border-0 bg-transparent p-0` overrides styles.css's global
           * input rule, which otherwise draws a second box inside this one.
           */
          className="text-text min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] outline-none"
          onChange={(event) => {
            /*
             * A pasted or picked value arrives whole. Committing on the comma
             * keypress alone would leave "pro,team" pasted as a single chip, and
             * a <datalist> pick fires change without a keypress at all.
             */
            const next = event.target.value;
            if (next.includes(',')) {
              const parts = next.split(',');
              const tail = parts.pop() ?? '';
              for (const part of parts) commit(part);
              setText(tail);
              return;
            }
            setText(next);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(text)}
        />
      </div>
      {unused.length > 0 && (
        <datalist id={listId}>
          {unused.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      )}
    </div>
  );
}
