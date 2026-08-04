/**
 * The options list for a `string_enum` flag.
 *
 * Reorder is buttons, not drag-and-drop. Two reasons and neither is effort:
 * `fireEvent` cannot drive a pointer-based drag, so a dragged list is a list
 * whose ordering is untested against a 90% branch floor; and drag without a
 * keyboard fallback is unusable for anyone who does not use a mouse. Order
 * matters here because the first option is what `initialValue` hands a new
 * environment, so it needs to be changeable - just not by dragging.
 */
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDownIcon, PlusIcon, XIcon } from '@/ui/icons';

export function EnumOptionsEditor({
  options,
  errors,
  disabled = false,
  onChange,
}: {
  options: string[];
  /** Keyed by index, as `issuesByPath` emits them (`enumOptions.0`). */
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (options: string[]) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  const replace = (index: number, value: string) =>
    onChange(options.map((option, i) => (i === index ? value : option)));

  const remove = (index: number) => onChange(options.filter((_, i) => i !== index));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved as string);
    onChange(next);
  };

  const add = () => {
    onChange([...options, '']);
    // Focus the new field imperatively on the next frame: `autoFocus` never
    // wins inside a Radix Dialog, and the input does not exist yet this tick.
    requestAnimationFrame(() => {
      const inputs = listRef.current?.querySelectorAll('input');
      inputs?.[inputs.length - 1]?.focus();
    });
  };

  const listError = errors.enumOptions;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Options</Label>
      <ul ref={listRef} className="m-0 flex list-none flex-col gap-1.5 p-0">
        {options.map((option, index) => {
          const error = errors[`enumOptions.${index}`];
          return (
            <li key={index} className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <Input
                  value={option}
                  disabled={disabled}
                  aria-label={`Option ${index + 1}`}
                  aria-invalid={error ? true : undefined}
                  className="font-mono text-[12.5px]"
                  onChange={(event) => replace(index, event.target.value)}
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || index === 0}
                  aria-label={`Move option ${index + 1} up`}
                  onClick={() => move(index, -1)}
                >
                  <ArrowDownIcon size={14} className="rotate-180" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || index === options.length - 1}
                  aria-label={`Move option ${index + 1} down`}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon size={14} />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  // Never leave zero options: an enum with no members can serve
                  // nothing, and the API's CHECK constraint rejects it anyway.
                  disabled={disabled || options.length === 1}
                  aria-label={`Remove option ${index + 1}`}
                  onClick={() => remove(index)}
                >
                  <XIcon size={14} />
                </Button>
              </div>
              {error && <p className="text-destructive m-0 text-[12px]">{error}</p>}
            </li>
          );
        })}
      </ul>
      {listError && <p className="text-destructive m-0 text-[12px]">{listError}</p>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={add}
        className="self-start"
      >
        <PlusIcon size={13} /> Add option
      </Button>
    </div>
  );
}
