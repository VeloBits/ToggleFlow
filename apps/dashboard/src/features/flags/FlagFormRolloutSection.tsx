/**
 * The create dialog's initial rollout: the one part of that form that writes to a
 * single environment rather than to the project-wide definition.
 *
 * ## Why a disclosure, collapsed
 *
 * Most flags are created cold - registered now, turned on in a later, deliberate
 * gesture - so the common path must not pay for this. Collapsed it is one line of
 * secondary text; opened it is the two questions that matter ("on?" and "for
 * whom?"). The alternative, two more always-visible fields, would put a rollout
 * decision in front of everyone who only wanted to declare a flag exists, in a
 * dialog that already has seven fields.
 *
 * Closing the disclosure resets the values, so a collapsed section cannot hold a
 * configured rollout that the dialog would then send invisibly: the disclosure IS
 * the switch, and closing it means "never mind". `toInitialStatePatch` turns that
 * reset state into no request at all.
 *
 * ## Why not `ui/accordion.tsx`
 *
 * That component is the landing page's FAQ: heading levels for a page outline,
 * roving arrow-key focus across several rows, and panels that stay mounted so
 * crawlers can read them. Here there is one row, no outline to join, and
 * unmounting the panel is the point - a control that is not in the DOM cannot be
 * mistaken for a value that will be submitted.
 *
 * That leaves `aria-controls` pointing at an id that only exists while open,
 * which is exactly what Radix's own Collapsible does; `aria-expanded` is the part
 * that gets announced.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronDownIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';

import { describeRollout, RolloutField } from './RolloutField';
import { fieldLabelId, OnOffChoice } from './value-controls';
import { INITIAL_ROLLOUT_OFF, type InitialRollout } from './flag-form';

const PANEL_ID = 'flag-initial-rollout';
const ENABLED_ID = 'flag-initial-enabled';
const PERCENT_ID = 'flag-initial-percent';
const HINT_ID = 'flag-initial-rollout-hint';

export function FlagFormRolloutSection({
  environmentName,
  value,
  onChange,
}: {
  environmentName: string;
  value: InitialRollout;
  onChange: (value: InitialRollout) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-border bg-bg2/50 flex flex-col gap-2 rounded-md border p-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        // Full width so the chevron sits at the row's right edge, and negative
        // margins so the ghost hover band lines up with the panel below it.
        className="-mx-1.5 w-[calc(100%+0.75rem)] justify-between px-1.5 font-normal"
        onClick={() => {
          setOpen(!open);
          if (open) onChange(INITIAL_ROLLOUT_OFF);
        }}
      >
        <span>Configure initial rollout in {environmentName}</span>
        <ChevronDownIcon size={14} aria-hidden className={cn(open && 'rotate-180')} />
      </Button>

      {open && (
        <div id={PANEL_ID} className="flex flex-col gap-3 pt-0.5">
          <div className="flex flex-col gap-1.5">
            <Label id={fieldLabelId(ENABLED_ID)}>Status in {environmentName}</Label>
            <OnOffChoice
              id={ENABLED_ID}
              on={value.enabled}
              labelledBy={fieldLabelId(ENABLED_ID)}
              describedBy={HINT_ID}
              onChange={(enabled) => onChange({ ...value, enabled })}
            />
          </div>

          {value.enabled && (
            <div className="flex flex-col gap-1.5">
              {/* No `htmlFor`: `RolloutField` is two controls that name
                  themselves, and the percentage input it would point at does not
                  exist in the "Everyone" mode - a `for` that dangles half the
                  time is worse than a caption. */}
              <Label>Audience</Label>
              <RolloutField
                id={PERCENT_ID}
                value={value.percent}
                describedBy={HINT_ID}
                onChange={(percent) => onChange({ ...value, percent })}
              />
            </div>
          )}
        </div>
      )}

      {/* One line in both states, and the only place the "other environments"
          rule is stated - repeating it beside each control would be a wall of
          text about the thing this section is trying not to be. */}
      <p id={HINT_ID} className="text-muted-foreground m-0 text-[12px]">
        {open
          ? `${value.enabled ? describeRollout(value.percent, environmentName) : `Created off in ${environmentName}.`} Every other environment stays off until you turn it on there.`
          : 'New flags start off in every environment.'}
      </p>
    </div>
  );
}
