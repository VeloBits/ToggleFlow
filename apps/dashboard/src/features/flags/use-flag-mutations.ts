/**
 * Optimistic flag mutations for the list page.
 *
 * This is the first optimistic update in the dashboard - everything else
 * invalidates and waits. It earns the complexity here because the boolean
 * switch is the product's signature gesture: a toggle that visibly lags a
 * round-trip feels like it might not have worked, which is the one feeling a
 * kill switch must never produce.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import type { JsonValue } from '@toggleflow/engine';

import { api, type Flag } from '@/api/client';
import { flagKeys } from '@/api/flags';
import { useToast } from '@/ui/toast';

export interface FlagPatch {
  enabled?: boolean;
  value?: JsonValue;
  rolloutPercent?: number | null;
  targetingRules?: unknown[];
}

export interface FlagPatchVars {
  flagId: string;
  patch: FlagPatch;
  /** Used in the success toast, so it can name the flag rather than say "Saved". */
  flagKey: string;
}

/**
 * Describe what changed, for the toast. Specific beats generic: "tool.ocr
 * turned off" is auditable at a glance in a way "Saved" is not, and this page
 * is where people flip production switches.
 */
function describePatch({ flagKey, patch }: FlagPatchVars): string {
  if (patch.enabled !== undefined) return `${flagKey} turned ${patch.enabled ? 'on' : 'off'}`;
  if (patch.value !== undefined) return `${flagKey} value updated`;
  if (patch.rolloutPercent !== undefined) {
    return patch.rolloutPercent === null
      ? `${flagKey} rollout removed`
      : `${flagKey} rolling out to ${patch.rolloutPercent}%`;
  }
  if (patch.targetingRules !== undefined) return `${flagKey} targeting updated`;
  return `${flagKey} updated`;
}

export function useFlagPatch(environmentId: string | null) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const listKey = environmentId ? flagKeys.list(environmentId) : null;

  return useMutation({
    mutationFn: ({ flagId, patch }: FlagPatchVars) =>
      // The route still addresses flags as tools; the rename is dashboard-only
      // and this is the one layer allowed to know that.
      api.patch(`/v1/environments/${environmentId}/tools/${flagId}/flag`, patch),

    onMutate: async (vars) => {
      if (!listKey) return {};
      /*
       * Cancel in-flight refetches first. Without this, a poll that started
       * before the mutation can land after the optimistic write and flash the
       * old value back - which reads as "my click was undone".
       */
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<Flag[]>(listKey);
      queryClient.setQueryData<Flag[]>(listKey, (rows) =>
        rows?.map((row) => (row.id === vars.flagId ? { ...row, ...vars.patch } : row)),
      );
      return { previous };
    },

    onError: (error, _vars, context) => {
      // Put the server's truth back before telling the user, so the row and the
      // message never disagree.
      if (context?.previous && listKey) queryClient.setQueryData(listKey, context.previous);
      toast(error instanceof Error ? error.message : 'Update failed', { variant: 'error' });
    },

    onSuccess: (_data, vars) => toast(describePatch(vars)),

    // Reconcile with the server even on success: the write also moves
    // `updatedAt`, and publishing is debounced server-side, so the row's own
    // timestamp is only correct after a refetch.
    onSettled: () => {
      if (listKey) void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

/*
 * ── Bulk ──────────────────────────────────────────────────────────────────────
 *
 * There is no bulk endpoint: `PATCH …/tools/:id/flag` is per flag, so applying
 * one body to a selection is N requests. Everything below exists because N
 * requests fail differently from one.
 */

/**
 * How many patches are in flight at once.
 *
 * Six, because that is what a browser will do anyway - the per-origin HTTP/1.1
 * connection cap is 6 in every engine that matters, and the dashboard reaches the
 * API through nginx. Firing 200 at once therefore does not make them faster; it
 * queues 194 of them below the app where nothing can report on them, and makes
 * the progress counter arrive in bursts of six instead of climbing. A lower bound
 * leaves sockets idle for no benefit, and unbounded is the same as 6 with worse
 * telemetry - plus, on the server, N patches each schedule a debounced ruleset
 * publish, and a wall of them is the least kind way to find that out.
 */
export const BULK_CONCURRENCY = 6;

/** Failures named in the summary toast before it switches to "+N more". */
const NAMED_FAILURES = 3;

export interface BulkPatchTarget {
  flagId: string;
  /** Named in the toast when this one fails, because "2 failed" alone is unactionable. */
  flagKey: string;
}

export interface BulkPatchFailure {
  flagKey: string;
  message: string;
}

export interface BulkPatchResult {
  succeeded: number;
  failed: BulkPatchFailure[];
}

export interface BulkPatchVars {
  targets: readonly BulkPatchTarget[];
  /** The same body for every target - see `flag-bulk-actions.ts`. */
  patch: FlagPatch;
  /** The action's past tense, for the summary toast: `Turned off 9 flags`. */
  summary: (succeeded: number) => string;
}

export interface BulkPatchState {
  /** Resolves with the outcome; never rejects, because a partial success is neither. */
  run: (vars: BulkPatchVars) => Promise<BulkPatchResult>;
  running: boolean;
  /** Non-null only while a run is in flight. */
  progress: { done: number; total: number } | null;
}

/**
 * One toast for N requests, and an honest one.
 *
 * A failure count with no names sends someone to the audit log to find out which
 * two of their twelve did not move, so the first few are named. The message is
 * the *first* failure's: N requests that fail in a bulk run nearly always fail
 * for one reason (a role, an expired token, a 500), and N messages in a 320px
 * toast is a wall of text that hides the count it came with.
 */
function summariseBulk(
  { succeeded, failed }: BulkPatchResult,
  summary: (succeeded: number) => string,
): string {
  if (failed.length === 0) return summary(succeeded);
  const named = failed
    .slice(0, NAMED_FAILURES)
    .map((failure) => failure.flagKey)
    .join(', ');
  const more = failed.length > NAMED_FAILURES ? ` +${failed.length - NAMED_FAILURES} more` : '';
  const detail = `${failed.length} failed (${failed[0]!.message}): ${named}${more}`;
  // Nothing succeeded: `summary(0)` would open with "Turned off 0 flags", which
  // reads as a report on a run that did something.
  return succeeded === 0 ? detail : `${summary(succeeded)}. ${detail}`;
}

/** Runs `worker` over `items`, at most `limit` of them in flight. */
async function pool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lane = async () => {
    while (cursor < items.length) await worker(items[cursor++]!);
  };
  // `min` so a selection of two does not start six lanes that immediately exit.
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/**
 * Applies one patch body to many flags.
 *
 * ## Why this is not a `useMutation`, and not optimistic
 *
 * `useFlagPatch` above is both, and neither carries over. A mutation is built
 * around one request with one result: what this needs from it is `isPending` (one
 * `useState`) and a settled hook (one line), while the two things it actually has
 * to express - per-row progress, and an outcome that is a partial success rather
 * than a success *or* an error - are not in that shape at all. `onError` firing
 * for two of twelve rows would toast twice and roll the whole list back.
 *
 * Optimism is dropped for the same reason. For one row it buys the switch its
 * immediacy; for twelve it would mean writing twelve rows and then unwinding only
 * the ones that failed, from a per-row snapshot map, while the list is being
 * refetched underneath - a rollback with more states than the thing it protects.
 * The bar is already showing progress, so nothing is gained by lying first: the
 * single invalidation at the end is the only thing that moves the rows, and it
 * cannot disagree with the server.
 */
export function useBulkFlagPatch(environmentId: string | null): BulkPatchState {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const run = useCallback(
    async ({ targets, patch, summary }: BulkPatchVars): Promise<BulkPatchResult> => {
      const total = targets.length;
      setProgress({ done: 0, total });

      const failed: BulkPatchFailure[] = [];
      let done = 0;
      await pool(targets, BULK_CONCURRENCY, async (target) => {
        try {
          await api.patch(`/v1/environments/${environmentId}/tools/${target.flagId}/flag`, patch);
        } catch (error) {
          failed.push({
            flagKey: target.flagKey,
            message: error instanceof Error ? error.message : 'Update failed',
          });
        }
        // Counted whether it worked or not: this is "requests answered", which is
        // what someone watching a bar wants to know. The failures are the toast's job.
        done += 1;
        setProgress({ done, total });
      });

      const result: BulkPatchResult = { succeeded: total - failed.length, failed };
      toast(summariseBulk(result, summary), {
        variant: failed.length > 0 ? 'error' : 'success',
      });

      /*
       * Once, at the end, not per row. The list is one cache entry, so N
       * invalidations are N refetches of the same thing, each one re-rendering
       * every row mid-run. `flagKeys.list` accepts a null environment (see its
       * docblock) and a run cannot be started without one, so this needs no guard.
       */
      await queryClient.invalidateQueries({ queryKey: flagKeys.list(environmentId) });
      setProgress(null);
      return result;
    },
    [environmentId, queryClient, toast],
  );

  // Derived rather than a second flag: two booleans for one fact is how a bar
  // ends up enabled while a request is still in the air.
  return { run, running: progress !== null, progress };
}
