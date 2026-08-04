/**
 * The render half of the flag-type registry - `Record<FlagValueType, …>`, the
 * mirror of `FLAG_TYPES` in `@toggleflow/engine`.
 *
 * The engine half owns validation and resolution; it cannot own React, because
 * that package runs inside workerd (see its index.ts). So the seam has two
 * halves keyed by the same union, and both are exhaustive `Record`s: adding
 * `'number'` to `FLAG_VALUE_TYPES` makes each of them a compile error until
 * filled in. That is what stops "extensible" from being a claim.
 *
 * Two surfaces per type, deliberately different:
 *
 *   - `Cell` is a one-gesture editor for a table row. It commits immediately,
 *     because the row is a list of live production values and a Save button per
 *     row would be noise.
 *   - `Field` is a labelled form control. It is uncontrolled by any mutation -
 *     the form owns the value - and is reused by the create/edit dialog's
 *     "Default value" and by the detail page's value editor, so a new type gets
 *     its table cell and its form input from the same entry.
 */
import { useEffect, useRef, useState, type ComponentType } from 'react';

import type { FlagConstraints, FlagValueType, JsonValue } from '@toggleflow/engine';
import { FLAG_TYPES } from '@toggleflow/engine';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { CheckIcon, XIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';

/** How long a production flip stays armed - matches `ConfirmButton`'s window. */
const ARM_WINDOW_MS = 4000;

export interface ValueCellProps {
  flag: {
    key: string;
    enabled: boolean;
    value: JsonValue | null;
    defaultValue: JsonValue | null;
    valueType: FlagValueType;
    enumOptions: string[];
  };
  /** Commit a change. The caller owns the mutation, its optimism and its toast. */
  onCommit: (patch: { enabled?: boolean; value?: JsonValue }) => void;
  disabled?: boolean;
  /**
   * Shown as the control's `title` when disabled. The doctrine from
   * `components/ui.tsx`'s ConfirmButton: keep the control on the page and
   * explain the absence, rather than vanishing and leaving it to be decoded.
   */
  disabledReason?: string;
  /**
   * Require a second gesture before committing. Set for production: a
   * single-click switch on prod is the accident this product exists to prevent.
   */
  requireConfirm?: boolean;
}

export interface ValueFieldProps {
  /** Wired to the field's label by the caller. */
  id: string;
  value: JsonValue | null;
  constraints: FlagConstraints;
  onChange: (value: JsonValue) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export interface ValueControl {
  Cell: ComponentType<ValueCellProps>;
  Field: ComponentType<ValueFieldProps>;
}

/**
 * Two-step arming, extracted so both the boolean switch and any future
 * destructive cell share one countdown and one disarm-on-disable rule.
 */
function useArmed(enabled: boolean) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  // Disarm if the control is disabled mid-countdown, so it cannot come back
  // already armed and fire on what the user reads as a first click.
  useEffect(() => {
    if (enabled) return;
    clearTimeout(timer.current);
    setArmed(false);
  }, [enabled]);

  return {
    armed,
    arm: () => {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), ARM_WINDOW_MS);
    },
    disarm: () => {
      clearTimeout(timer.current);
      setArmed(false);
    },
  };
}

// ── boolean ──────────────────────────────────────────────────────────────────

function BooleanCell({
  flag,
  onCommit,
  disabled = false,
  disabledReason,
  requireConfirm = false,
}: ValueCellProps) {
  const { armed, arm, disarm } = useArmed(!disabled);

  const commit = () => {
    disarm();
    onCommit({ enabled: !flag.enabled });
  };

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={flag.enabled}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        // The accessible name has to carry the key: a table of switches all
        // labelled "Toggle" is unusable with a screen reader, and it is also
        // how the tests address a specific row.
        aria-label={`Toggle ${flag.key}`}
        onCheckedChange={() => (requireConfirm && !armed ? arm() : commit())}
        className={cn(armed && 'ring-destructive/50 ring-[3px]')}
      />
      {armed && (
        <Button
          size="xs"
          variant="destructive"
          onClick={commit}
          aria-label={`Confirm turning ${flag.enabled ? 'off' : 'on'} ${flag.key}`}
        >
          Confirm
        </Button>
      )}
    </div>
  );
}

function BooleanField({ id, value, onChange, disabled, describedBy }: ValueFieldProps) {
  return (
    <Switch
      id={id}
      checked={value === true}
      disabled={disabled}
      aria-describedby={describedBy}
      onCheckedChange={(checked) => onChange(checked)}
    />
  );
}

// ── string ───────────────────────────────────────────────────────────────────

/**
 * Read-only until clicked, then an input with Enter/Escape. Not an always-live
 * input: a table of focusable text fields makes the row-click-to-open-detail
 * gesture ambiguous, and every keystroke would be a candidate mutation.
 */
function StringCell({ flag, onCommit, disabled = false, disabledReason }: ValueCellProps) {
  const current = typeof flag.value === 'string' ? flag.value : '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus imperatively: `autoFocus` loses to Radix's FocusScope when this cell
  // is rendered inside a dialog (see src/ui/dialog.tsx).
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft !== current) onCommit({ value: draft });
  };
  const cancel = () => {
    setDraft(current);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : 'Click to edit'}
        onClick={() => {
          setDraft(current);
          setEditing(true);
        }}
        /*
         * `bg-transparent` and the border utilities are load-bearing, not
         * decoration: styles.css's global `button { border; background; padding }`
         * lives in Tailwind's `components` layer, so any bare <button> in this app
         * inherits a bordered box unless a utility (a later layer) overrides it.
         * The dashed border is then deliberate - it affords "click to edit"
         * without pretending to be an input that already has focus.
         */
        className="border-input hover:bg-accent hover:border-border-strong disabled:hover:bg-transparent flex min-w-0 max-w-full rounded-md border border-dashed bg-transparent px-2 py-1 text-left font-mono text-[12.5px] disabled:cursor-not-allowed"
        aria-label={`Edit value of ${flag.key}`}
      >
        <span className="truncate">{current === '' ? <Empty /> : current}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={draft}
        aria-label={`Value of ${flag.key}`}
        className="h-7 font-mono text-[12.5px]"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      />
      <Button size="icon-xs" variant="ghost" onClick={save} aria-label="Save value">
        <CheckIcon size={13} />
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={cancel} aria-label="Cancel editing">
        <XIcon size={13} />
      </Button>
    </div>
  );
}

function StringField({ id, value, onChange, disabled, invalid, describedBy }: ValueFieldProps) {
  return (
    <Input
      id={id}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className="font-mono text-[12.5px]"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── string_enum ──────────────────────────────────────────────────────────────

function StringEnumCell({ flag, onCommit, disabled = false, disabledReason }: ValueCellProps) {
  const current = typeof flag.value === 'string' ? flag.value : '';
  return (
    <NativeSelect
      value={current}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      aria-label={`Value of ${flag.key}`}
      className="h-7 font-mono text-[12.5px]"
      wrapperClassName="max-w-44"
      onChange={(e) => onCommit({ value: e.target.value })}
    >
      {/* A value outside the option list should be visible rather than silently
          re-mapped to the first option - it means someone shrank the options
          behind this environment's back. The API guards against that, so this is
          a belt-and-braces case, not an expected one. */}
      {!flag.enumOptions.includes(current) && <option value={current}>{current || '—'}</option>}
      {flag.enumOptions.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </NativeSelect>
  );
}

function StringEnumField({
  id,
  value,
  constraints,
  onChange,
  disabled,
  invalid,
  describedBy,
}: ValueFieldProps) {
  const current = typeof value === 'string' ? value : '';
  return (
    <NativeSelect
      id={id}
      value={current}
      disabled={disabled || constraints.enumOptions.length === 0}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className="font-mono text-[12.5px]"
      onChange={(e) => onChange(e.target.value)}
    >
      {constraints.enumOptions.length === 0 ? (
        <option value="">Add an option first</option>
      ) : (
        <>
          {!constraints.enumOptions.includes(current) && (
            <option value="">Select an option…</option>
          )}
          {constraints.enumOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </>
      )}
    </NativeSelect>
  );
}

// ── the registry ─────────────────────────────────────────────────────────────

export const VALUE_CONTROLS: Record<FlagValueType, ValueControl> = {
  boolean: { Cell: BooleanCell, Field: BooleanField },
  string: { Cell: StringCell, Field: StringField },
  string_enum: { Cell: StringEnumCell, Field: StringEnumField },
};

/**
 * Total lookup, mirroring the engine's `flagType`. A flag whose type this build
 * has never heard of still renders a row - as a boolean - rather than throwing
 * inside a table body and blanking the page.
 */
export function valueControl(valueType: string): ValueControl {
  return VALUE_CONTROLS[valueType as FlagValueType] ?? VALUE_CONTROLS.boolean;
}

/** The label for a type, from the engine's registry so there is one spelling. */
export function valueTypeLabel(valueType: string): string {
  return FLAG_TYPES[valueType as FlagValueType]?.label ?? valueType;
}

function Empty() {
  return <span className="text-muted-foreground italic">empty</span>;
}
