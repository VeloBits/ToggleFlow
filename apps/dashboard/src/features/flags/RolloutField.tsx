/**
 * The rollout percentage, as one control.
 *
 * Shared by the create-flag dialog's "Initial rollout" section and the bulk
 * "Configure rollout" dialog, because a percentage means the same thing in both
 * and two inputs that drift are two different products.
 *
 * ## Two modes, not a magic empty string
 *
 * `flag_states.rollout_percent` is nullable, and null does not mean 0 - it means
 * "everyone, while on". Those are opposite outcomes, so they are opposite
 * choices here rather than a number field where clearing it silently changes
 * meaning. `FlagStatePanel`'s bare number input labelled "(empty = everyone when
 * on)" is the version this replaces.
 *
 * ## Why presets and a number field, and no slider
 *
 * A canary is chosen from a handful of conventional values (1, 5, 10, 25, 50),
 * so those are one click each; anything else is typed. A native
 * `input[type=range]` was the obvious third option and is rejected: styles.css
 * gives every bare `input` a border, a background and padding, and un-doing that
 * plus styling `::-webkit-slider-thumb` and `::-moz-range-thumb` is more
 * cross-browser surface than the control is worth. The bar below the field gives
 * the same at-a-glance read of magnitude without being a second way to set it.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/ui/segmented-control';

/** null = serve to everyone while on; 0-100 = that share of users. */
export type RolloutPercent = number | null;

const PRESETS = [1, 5, 10, 25, 50];

/** What the API's `rolloutPercent` accepts, and therefore what this may emit. */
export function isValidRollout(value: RolloutPercent): boolean {
  return value === null || (Number.isInteger(value) && value >= 0 && value <= 100);
}

/**
 * One line of prose for whatever is currently selected. Used by both consumers'
 * hint text, so the explanation of a rollout is written once.
 */
export function describeRollout(value: RolloutPercent, environmentName: string): string {
  if (value === null) return `Serves every user in ${environmentName} while the flag is on.`;
  if (value === 0) {
    return `Serves nobody in ${environmentName} yet — the flag is live but held at 0%.`;
  }
  return `Serves about ${value}% of users in ${environmentName}, chosen by a stable hash of the user id, so the same user keeps the same answer.`;
}

export function RolloutField({
  id,
  value,
  onChange,
  disabled = false,
  describedBy,
  /** The last percentage typed, restored when switching back from "Everyone". */
  fallbackPercent = 10,
}: {
  id: string;
  value: RolloutPercent;
  onChange: (value: RolloutPercent) => void;
  disabled?: boolean;
  describedBy?: string;
  fallbackPercent?: number;
}) {
  const percentage = value !== null;

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        aria-label="Rollout audience"
        value={percentage ? 'percentage' : 'everyone'}
        onValueChange={(next) => onChange(next === 'everyone' ? null : fallbackPercent)}
        options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'percentage', label: 'Percentage' },
        ]}
        disabled={disabled}
      />

      {percentage && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-24">
              <Input
                id={id}
                type="number"
                min={0}
                max={100}
                step={1}
                value={String(value)}
                disabled={disabled}
                aria-label="Rollout percentage"
                aria-describedby={describedBy}
                aria-invalid={isValidRollout(value) ? undefined : true}
                className="pr-7 tabular-nums"
                onChange={(event) => {
                  const next = event.target.value;
                  // An empty field means "mid-edit", not "everyone" - clamp to 0
                  // rather than flipping the mode out from under the caret.
                  onChange(next === '' ? 0 : Math.max(0, Math.min(100, Number(next))));
                }}
              />
              <span
                aria-hidden
                className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12.5px]"
              >
                %
              </span>
            </div>
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={value === preset ? 'secondary' : 'ghost'}
                size="xs"
                disabled={disabled}
                aria-pressed={value === preset}
                className="tabular-nums"
                onClick={() => onChange(preset)}
              >
                {preset}%
              </Button>
            ))}
          </div>

          {/* Magnitude at a glance. aria-hidden: the number field above is the
              accessible value, and a second announcement of it is noise. */}
          <div aria-hidden className="bg-bg2 h-1.5 w-full max-w-xs overflow-hidden rounded-pill">
            <div
              className="bg-rollout h-full rounded-pill transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
