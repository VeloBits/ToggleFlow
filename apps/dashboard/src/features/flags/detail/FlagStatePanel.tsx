/**
 * The State tab: everything that acts on ONE environment.
 *
 * ## Why the value editor is rendered through the type registry
 *
 * The field comes from `valueControl(valueType).Field`, the same entry the list
 * page's cell and the create/edit dialog's "Default value" use. Adding a flag
 * type therefore costs one entry in `value-controls.tsx` and nothing here - the
 * promise `FLAG_TYPES`' docblock makes, kept.
 *
 * ## Why a boolean flag gets no value editor
 *
 * For `boolean`, the served value IS `enabled` (`derivesFromEnabled`), and the
 * API rejects a PATCH carrying a `value` for one rather than silently dropping
 * it. A second control that renders the switch's own state back at you would be
 * two widgets for one fact, and the first thing anyone would ask is which of
 * them wins. So the switch is the value, and the copy under it says so.
 *
 * ## Why the value has a Save button when the list's cell does not
 *
 * The list commits on the gesture, and arms twice on production, because a table
 * row is a live view of what users are getting. Here the field is a form control
 * the panel owns: reaching Save is already the second gesture, so a third
 * confirm would be ceremony. The kill switch keeps its production two-step -
 * that one IS a single gesture, and it is the one that takes a feature away from
 * everybody at once.
 */
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { flagType, targetingRuleSchema, type JsonValue } from '@toggleflow/engine';

import type { Flag, FlagDefinitionDetail } from '@/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { prettyJson } from '@/components/diff';
import { JsonField } from '@/components/JsonField';
import { Panel } from '@/components/page';
import { ConfirmButton } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { AlertTriangleIcon } from '@/ui/icons';

import { FlagStatusBadge } from '../FlagStatusBadge';
import { valueControl } from '../value-controls';
import { useFlagPatch, type FlagPatch } from '../use-flag-mutations';

/**
 * The rules field is a raw JSON array validated against the engine's own schema,
 * not a rule builder. A builder is the right eventual answer, but the schema is a
 * discriminated union of nine operators plus segments plus an optional per-rule
 * value, and half a builder is worse than a textarea: it would silently drop the
 * shapes it does not know how to render. Validating against
 * `targetingRuleSchema` means the field accepts exactly what the evaluator
 * accepts, no more and no less.
 */
const targetingRulesSchema = z.array(targetingRuleSchema);

export function FlagStatePanel({
  flag,
  state,
  pending,
  canEdit,
}: {
  flag: FlagDefinitionDetail;
  /** This environment's row from `['flags', envId]`; absent while it loads. */
  state: Flag | undefined;
  pending: boolean;
  canEdit: boolean;
}) {
  const ws = useWorkspace();
  const patch = useFlagPatch(ws.environmentId);
  const descriptor = flagType(flag.valueType);
  const { Field } = valueControl(flag.valueType);

  const isProd = ws.environment?.key === 'prod';
  const environmentName = ws.environment?.name ?? 'this environment';

  const [rollout, setRollout] = useState('');
  const [rules, setRules] = useState('[]');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [value, setValue] = useState<JsonValue | null>(null);

  /*
   * Re-seed the drafts whenever the server row changes identity, which includes
   * the optimistic write `useFlagPatch` performs. That is deliberate: after any
   * commit the fields should show what the environment now holds, not a stale
   * draft that would silently overwrite it on the next Save.
   */
  useEffect(() => {
    if (!state) return;
    setRollout(state.rolloutPercent === null ? '' : String(state.rolloutPercent));
    setRules(prettyJson(state.targetingRules));
    setValue(
      state.value ??
        flag.defaultValue ??
        flagType(flag.valueType).initialValue({ enumOptions: flag.enumOptions }),
    );
  }, [state, flag.defaultValue, flag.valueType, flag.enumOptions]);

  if (!state) {
    return (
      <Panel title={`State in ${environmentName}`}>
        <div className="p-4">
          {pending ? (
            <div className="flex flex-col gap-3" role="status" aria-label="Loading flag state">
              <Skeleton className="h-8 w-52" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <p className="text-muted-foreground m-0 text-[13px]">
              This flag has no state in {environmentName}. Its SDKs fall back to the default in your
              code until it does.
            </p>
          )}
        </div>
      </Panel>
    );
  }

  const rolloutValue = () => (rollout === '' ? null : Number(rollout));
  const commit = (body: FlagPatch) =>
    patch.mutate({ flagId: flag.id, flagKey: flag.key, patch: body });

  const saveTargeting = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rules);
    } catch {
      setRulesError('Not valid JSON.');
      return;
    }
    const checked = targetingRulesSchema.safeParse(parsed);
    if (!checked.success) {
      // The field path, not just the message: "0.enabled: Required" says which
      // rule is wrong, which is the only part that helps in a list of six.
      setRulesError(
        checked.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
      return;
    }
    setRulesError(null);
    // Saved together with the rollout because they are one decision - "who sees
    // this" - and two buttons over one paragraph of JSON invite saving half of it.
    commit({ targetingRules: checked.data, rolloutPercent: rolloutValue() });
  };

  return (
    <div className="flex flex-col gap-4">
      {flag.archived && (
        <Alert>
          <AlertTriangleIcon size={15} />
          <AlertTitle>This flag is archived</AlertTitle>
          <AlertDescription>
            Archived flags are dropped from published snapshots, so every SDK falls back to the
            default in your code. Restore it before changing its state.
          </AlertDescription>
        </Alert>
      )}

      <Panel title={`State in ${environmentName}`}>
        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <FlagStatusBadge
                flag={{
                  enabled: state.enabled,
                  rolloutPercent: state.rolloutPercent,
                  archived: flag.archived,
                }}
              />
              {canEdit && (
                <>
                  <ConfirmButton
                    className={buttonVariants({
                      variant: state.enabled ? 'destructive' : 'default',
                      size: 'sm',
                    })}
                    label={state.enabled ? 'Turn OFF (kill switch)' : 'Turn ON'}
                    confirmLabel={`Confirm ${state.enabled ? 'OFF' : 'ON'} in ${ws.environment?.key}?`}
                    // Production asks twice. Keyed off the environment key, the
                    // same test the list page's cells use.
                    requireConfirm={isProd}
                    onConfirm={() => commit({ enabled: !state.enabled })}
                  />
                  {isProd && (
                    <span className="text-muted-foreground text-[12px]">
                      production changes ask for confirmation
                    </span>
                  )}
                </>
              )}
            </div>
            <p className="text-muted-foreground m-0 text-[12px]">
              {descriptor.derivesFromEnabled
                ? 'A boolean flag serves this switch: on is true, off is false.'
                : 'While on, this flag serves the value below. While off it serves config.fallback - see the Config tab.'}
            </p>
          </div>

          {!descriptor.derivesFromEnabled && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-value">Value served while on</Label>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 max-w-md flex-1">
                  <Field
                    id="flag-value"
                    value={value}
                    constraints={{ enumOptions: flag.enumOptions }}
                    disabled={!canEdit}
                    describedBy="flag-value-hint"
                    onChange={setValue}
                  />
                </div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={patch.isPending}
                    onClick={() => commit({ value })}
                  >
                    Save value
                  </Button>
                )}
              </div>
              <p id="flag-value-hint" className="text-muted-foreground m-0 text-[12px]">
                What every user gets while this flag is on, unless a targeting rule below serves its
                own. Empty here means the definition&apos;s default value.
              </p>
            </div>
          )}

          <div className="flex max-w-xs flex-col gap-1.5">
            <Label htmlFor="rollout">Rollout % (empty = everyone when on)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rollout"
                type="number"
                min={0}
                max={100}
                value={rollout}
                disabled={!canEdit}
                className="w-24 tabular-nums"
                onChange={(event) => setRollout(event.target.value)}
              />
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => commit({ rolloutPercent: rolloutValue() })}
                >
                  Save
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <JsonField
              id="targeting"
              label="Targeting rules"
              value={rules}
              onChange={setRules}
              error={rulesError}
              disabled={!canEdit}
              hint={
                <>
                  First match wins; segments are referenced by key. A rule may also serve its own
                  value with <code className="font-mono">&quot;value&quot;: …</code> for flags whose
                  type is not boolean.
                </>
              }
            />
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={patch.isPending}
                onClick={saveTargeting}
              >
                Save targeting + rollout
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
