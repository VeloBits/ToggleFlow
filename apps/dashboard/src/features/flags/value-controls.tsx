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
 *     its table cell and its form input from the same entry. How a caller's
 *     `<Label>` attaches to it is part of that entry too (`labelWiring`), because
 *     not every type's field is an element `htmlFor` can bind to.
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import type { FlagConstraints, FlagValueType, JsonValue } from '@toggleflow/engine';
import { FLAG_TYPES } from '@toggleflow/engine';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/ui/segmented-control';
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
  /**
   * How a caller must pair its `<Label>` with `Field`, because not every type's
   * field is a labelable element. `'htmlFor'` is the ordinary case - the `id`
   * lands on an `input` or a `select`. `'aria-labelledby'` says the field's root
   * is a `div`, so the label carries `fieldLabelId(id)` instead and the field
   * names itself from it. Read from the registry rather than tested per type, so
   * a new type declares its own wiring in the same entry as its components.
   */
  labelWiring: 'htmlFor' | 'aria-labelledby';
}

/**
 * The id a `'aria-labelledby'` field expects its caller's `<Label>` to carry.
 *
 * `htmlFor` binds only to *labelable* elements (`input`, `select`, `textarea`,
 * `button`, …). A segmented control's root is a `div`, so the naive version -
 * `<Label htmlFor={id}>` over `<div id={id}>` - leaves a dangling `for`: the
 * field has no accessible name and clicking the label does nothing at all,
 * silently. Inverting the pair fixes both halves, and it is why this id exists
 * as a function rather than as a string each call site spells itself.
 */
export const fieldLabelId = (id: string) => `${id}-label`;

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

/**
 * Off / On as two named choices, for the places a boolean is *chosen in a form*
 * rather than flipped on a live row.
 *
 * ## Why not the switch this replaces
 *
 * A bare `Switch` under a "Default value" label said nothing: the only reading of
 * the selected state was a thumb position, "off" and "not filled in yet" looked
 * identical, and there was no word on screen tying either state to `true` or
 * `false`. Two segments put the choice in words, and Radix's ToggleGroup renders
 * them as `role="radio"` inside a `radiogroup` - "one of these two", which is
 * what a default value is, arrow-key navigable, and never empty.
 * `SegmentedControl` is the app's existing spelling of that control (the
 * environment switcher and `RolloutField` both use it), so this is the same
 * control rather than a fourth one.
 *
 * The switch stays where it belongs: `BooleanCell` is a live production toggle in
 * a table row, where a two-segment control would be three times as wide and read
 * as a filter rather than a state.
 *
 * ## Naming
 *
 * The radiogroup carries the `id` and names itself from the caller's `<Label>`
 * via `aria-labelledby` (see `fieldLabelId`) - not `htmlFor`, which reaches
 * labelable elements only and would dangle against a `div`. The remaining
 * wrapper is layout for the trailing value and carries nothing semantic, so
 * there is one announcement here, not two.
 */
export function OnOffChoice({
  id,
  on,
  onChange,
  labelledBy,
  describedBy,
  disabled = false,
  children,
}: {
  id: string;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Id of the visible `<Label>`; `fieldLabelId(id)` for a registry field. */
  labelledBy: string;
  describedBy?: string;
  disabled?: boolean;
  /** Trailing note beside the segments - the chosen state spelled out. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <SegmentedControl
        id={id}
        labelledBy={labelledBy}
        describedBy={describedBy}
        disabled={disabled}
        value={on ? 'on' : 'off'}
        onValueChange={(next) => onChange(next === 'on')}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' },
        ]}
      />
      {children}
    </div>
  );
}

function BooleanField({ id, value, onChange, disabled, describedBy }: ValueFieldProps) {
  const on = value === true;
  return (
    <OnOffChoice
      id={id}
      on={on}
      labelledBy={fieldLabelId(id)}
      describedBy={describedBy}
      disabled={disabled}
      onChange={onChange}
    >
      {/* The value, not a third segment: "On" is the gesture, `true` is what the
          flag serves, and a boolean flag's Settings tab prints it in mono too. */}
      <span className="text-muted-foreground font-mono text-[12px]">
        {FLAG_TYPES.boolean.format(on)}
      </span>
    </OnOffChoice>
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
  boolean: { Cell: BooleanCell, Field: BooleanField, labelWiring: 'aria-labelledby' },
  string: { Cell: StringCell, Field: StringField, labelWiring: 'htmlFor' },
  string_enum: { Cell: StringEnumCell, Field: StringEnumField, labelWiring: 'htmlFor' },
};

/**
 * Total lookup, mirroring the engine's `flagType`. A flag whose type this build
 * has never heard of still renders a row - as a boolean - rather than throwing
 * inside a table body and blanking the page.
 */
export function valueControl(valueType: string): ValueControl {
  return VALUE_CONTROLS[valueType as FlagValueType] ?? VALUE_CONTROLS.boolean;
}

/*
 * `valueTypeLabel` used to live here - `FLAG_TYPES[t]?.label ?? t`, with a
 * docblock claiming it was so there was one spelling of a type's name. It had no
 * callers, and `FlagTypeBadge` does the same lookup inline, so it was in fact a
 * second place for that spelling to be. Removed rather than adopted: the engine's
 * registry is the single source, and a one-line re-export of it is not a seam,
 * just an extra name to keep in step.
 */

function Empty() {
  return <span className="text-muted-foreground italic">empty</span>;
}
