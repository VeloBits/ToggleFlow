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
