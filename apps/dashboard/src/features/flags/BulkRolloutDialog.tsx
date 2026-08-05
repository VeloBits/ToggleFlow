/**
 * "Configure rollout" for a selection - the one bulk action that has to ask
 * something before it can run.
 *
 * The control is `RolloutField`, unchanged, because a percentage means the same
 * thing here as it does in the create-flag dialog and two inputs that drift are
 * two different products.
 *
 * ## Why this also turns the flags on
 *
 * The emitted body is `{ rolloutPercent, enabled: true }`. A percentage is a share
 * of the traffic a flag is *live* for, so 10% on an off flag serves nobody -
 * someone who selects twelve flags and types 10 is starting a canary, not arming
 * one silently for later. The alternative was to leave `enabled` alone, which
 * quietly splits the selection into flags that are now rolling out and flags that
 * are configured to some day, with nothing on screen to tell them apart. Rejected
 * for the same reason the skipped-row count exists.
 *
 * So it is stated instead of assumed: the count of currently-off flags is named
 * in the dialog before the button is pressed.
 *
 * ## Why the submit is the confirmation on production
 *
 * The immediate actions arm in place in the bar. Reaching a dialog's submit is
 * already the second gesture, so a third would be ceremony - the same call
 * `FlagStatePanel` makes about its Save buttons. What production changes is the
 * button's text, which names the environment it is about to change.
 */
import { useState } from 'react';

import { Label } from '@/components/ui/label';
import { DialogActions, Form } from '@/components/form';
import { Dialog } from '@/ui/dialog';

import { flagCount, type BulkDialogProps } from './flag-bulk-actions';
import { RolloutField, describeRollout, isValidRollout, type RolloutPercent } from './RolloutField';

export function BulkRolloutDialog({
  targets,
  environmentName,
  isProd,
  onCancel,
  onApply,
}: BulkDialogProps) {
  /*
   * 10% rather than "Everyone": every mode of this dialog is one click away, and
   * opening on a percentage puts the caret in the number field (see `Dialog`'s
   * first-field focus) instead of opening on the setting that serves the lot.
   */
  const [percent, setPercent] = useState<RolloutPercent>(10);
  const off = targets.filter((flag) => !flag.enabled).length;

  return (
    <Dialog title={`Configure rollout for ${flagCount(targets.length)}`} onClose={onCancel}>
      <Form onSubmit={() => onApply({ rolloutPercent: percent, enabled: true })}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-rollout">Rollout</Label>
            <RolloutField
              id="bulk-rollout"
              value={percent}
              onChange={setPercent}
              describedBy="bulk-rollout-hint"
            />
            <p id="bulk-rollout-hint" className="text-muted-foreground m-0 text-[12px]">
              {describeRollout(percent, environmentName)}
            </p>
          </div>

          {off > 0 && (
            <p className="text-muted-foreground m-0 text-[12px]">
              Any of these that are off will be turned on — {flagCount(off)} right now. A rollout
              percentage on an off flag serves nobody.
            </p>
          )}

          {isProd && (
            <p className="text-destructive m-0 text-[12px]">
              This changes what {environmentName} serves, for every one of the{' '}
              {flagCount(targets.length)} at once.
            </p>
          )}
        </div>

        <DialogActions
          submitLabel={
            isProd
              ? `Apply to ${flagCount(targets.length)} in ${environmentName}`
              : `Apply to ${flagCount(targets.length)}`
          }
          /*
           * Disabled only by the one rule this form has, unlike the flag form,
           * where a disabled submit could not explain which of several cross-field
           * rules was unmet. Here there is a single field, `RolloutField` already
           * marks itself invalid, and this also stops Enter submitting a NaN.
           */
          disabled={!isValidRollout(percent)}
          // The dialog closes on apply and the bar owns the progress from there,
          // so this button never has a pending state of its own.
          pending={false}
          onClose={onCancel}
        />
      </Form>
    </Dialog>
  );
}
