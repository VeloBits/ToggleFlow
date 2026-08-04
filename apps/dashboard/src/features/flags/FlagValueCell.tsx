/**
 * The "Current value" column.
 *
 * The subtlety this cell exists to make visible: for a non-boolean flag,
 * `value` is what it serves *while on*. Switched off, it serves
 * `config.fallback` instead - a convention that has been in the wire format
 * since v1 (see `snapshotToolSchema`'s docblock) but has never been shown
 * anywhere in the dashboard. So an off string flag renders its configured value
 * struck through, followed by what users are actually getting.
 *
 * Showing the configured value alone would be a lie, and showing only the
 * fallback would hide what turning it on would do. Both, once, in the width of
 * a table cell.
 */
import type { FlagValueType, JsonValue } from '@toggleflow/engine';
import { flagType } from '@toggleflow/engine';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { valueControl } from './value-controls';

export interface FlagValueCellFlag {
  id: string;
  key: string;
  enabled: boolean;
  archived: boolean;
  value: JsonValue | null;
  defaultValue: JsonValue | null;
  valueType: FlagValueType;
  enumOptions: string[];
  /**
   * `config.fallback` for this environment.
   *
   * Three-valued on purpose. `undefined` means "not known here" - the list
   * endpoint returns flag state but not configs, and fetching one config per row
   * to fill a column would be N requests for a detail nobody asked for yet. So
   * the list says an off flag serves its fallback without claiming to know what
   * it is, and the detail page, which does load the config, shows the value.
   * `null` means "known, and there is no fallback", which is a real served
   * value and reads differently.
   */
  fallback?: JsonValue | null;
}

export function FlagValueCell({
  flag,
  onCommit,
  canEdit,
  requireConfirm,
}: {
  flag: FlagValueCellFlag;
  onCommit: (patch: { enabled?: boolean; value?: JsonValue }) => void;
  canEdit: boolean;
  requireConfirm: boolean;
}) {
  const { Cell } = valueControl(flag.valueType);
  const descriptor = flagType(flag.valueType);

  const disabledReason = !canEdit
    ? 'You need the developer or admin role to change flag values'
    : flag.archived
      ? 'This flag is archived. Restore it to make changes.'
      : undefined;

  const control = (
    <Cell
      flag={flag}
      onCommit={onCommit}
      disabled={!canEdit || flag.archived}
      disabledReason={disabledReason}
      requireConfirm={requireConfirm}
    />
  );

  // A boolean flag's switch IS its value, so there is nothing to add.
  if (descriptor.derivesFromEnabled) return control;

  if (flag.enabled) return control;

  const fallbackKnown = flag.fallback !== undefined;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {/* The configured value, struck through: this is what turning the flag on
          would serve, and hiding it would make the row unreadable as a plan. */}
      <span className="min-w-0 opacity-50 [&_*]:line-through">{control}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground shrink-0 font-mono text-[12px]">
            {fallbackKnown ? (
              <>→ {flag.fallback === null ? 'null' : descriptor.format(flag.fallback ?? null)}</>
            ) : (
              '→ fallback'
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {!fallbackKnown
            ? 'This flag is off, so it serves its config fallback. Open the flag to see the value.'
            : flag.fallback === null
              ? 'This flag is off and has no config fallback, so it serves null.'
              : 'This flag is off, so it serves its config fallback.'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
