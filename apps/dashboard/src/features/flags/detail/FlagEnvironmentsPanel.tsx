/**
 * One flag across every environment in the project - and read-only on purpose.
 *
 * ## Why nothing here is editable
 *
 * "Edited the wrong environment" is this category's defining catastrophic error.
 * It is the reason environment inheritance is a point-in-time snapshot with no
 * live link (see the docblock on `apps/api/src/lib/environment-inheritance.ts`),
 * the reason the environment carries a colour, and the reason the topbar names it
 * at all times. A grid of live switches sitting on a page whose header names a
 * *different* environment is the most efficient way to cause exactly that
 * mistake: the row you click and the environment you believe you are in are one
 * glance apart.
 *
 * So a row's only action is to make its environment the one you are standing in.
 * After that, the State tab - which is labelled with the environment it edits -
 * is where the change happens. One extra click, in return for the edit never
 * being ambiguous.
 *
 * ## Where the data comes from
 *
 * `GET /v1/tools/:flagId` already returns `flagStates[]` joined to environments,
 * so this whole tab costs no request of its own. What it does NOT have is each
 * environment's `config.fallback`, which is why "Current value" shows the value
 * this environment serves *when on* rather than running `resolveValue` - the
 * honest alternative would be one config fetch per environment for a column
 * nobody opened this tab to read.
 */
import { flagType } from '@toggleflow/engine';

import type { FlagDefinitionDetail } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, Panel } from '@/components/page';
import { environmentTone } from '@/components/nav/environment-tone';
import { useWorkspace } from '@/state/WorkspaceContext';
import { GlobeIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';
import { relativeTime } from '@/ui/relative-time';

import { FlagStatusBadge } from '../FlagStatusBadge';

/** Absent rather than zero - an em dash reads as "nothing here", `0%` does not. */
const DASH = '—';

export function FlagEnvironmentsPanel({ flag }: { flag: FlagDefinitionDetail }) {
  const ws = useWorkspace();
  const descriptor = flagType(flag.valueType);

  if (flag.flagStates.length === 0) {
    return (
      <Panel title="Environments">
        <EmptyState
          icon={GlobeIcon}
          title="This flag has no environment state yet"
          description="A flag gets a row per environment when it is registered. If this stays empty, the flag was created before this project's environments were."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Environments">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Environment</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-48">Current value</TableHead>
            <TableHead className="w-24">Rollout</TableHead>
            <TableHead className="w-20">Rules</TableHead>
            <TableHead className="w-32">Updated</TableHead>
            <TableHead className="w-52" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {flag.flagStates.map((state) => {
            const isCurrent = state.environmentId === ws.environmentId;
            // The name lives on the workspace's environment list, the state on
            // the flag. A row whose environment that list has not caught up with
            // yet (freshly created, query not refetched) still has to render, so
            // it falls back to the key the flag itself carries.
            const environment = ws.environments.find((e) => e.id === state.environmentId);
            const served = descriptor.derivesFromEnabled
              ? state.enabled
              : (state.value ?? flag.defaultValue);

            return (
              <TableRow
                key={state.environmentId}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(isCurrent && 'bg-primary-soft/50')}
              >
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        environmentTone(state.environmentKey).dot,
                      )}
                    />
                    <span className="text-text font-medium">
                      {environment?.name ?? state.environmentKey}
                    </span>
                    <span className="text-muted-foreground font-mono text-[12px]">
                      {state.environmentKey}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <FlagStatusBadge
                    flag={{
                      enabled: state.enabled,
                      rolloutPercent: state.rolloutPercent,
                      archived: flag.archived,
                    }}
                  />
                </TableCell>
                <TableCell className="font-mono text-[12.5px]">
                  {descriptor.format(served)}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {state.rolloutPercent === null ? DASH : `${state.rolloutPercent}%`}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {state.targetingRules.length === 0 ? DASH : state.targetingRules.length}
                </TableCell>
                <TableCell
                  className="text-muted-foreground text-[12.5px]"
                  title={new Date(state.updatedAt).toLocaleString()}
                >
                  {relativeTime(state.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  {isCurrent ? (
                    <span className="text-muted-foreground text-[12px]">
                      Editing this environment
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => ws.selectEnvironment(state.environmentId)}
                    >
                      Switch to this environment
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
