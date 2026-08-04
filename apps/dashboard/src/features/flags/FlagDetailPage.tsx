/**
 * One flag, in depth.
 *
 * ## Why tabs, and why they live in the URL
 *
 * The old page was one scroll of four unrelated concerns: this environment's
 * switch, this environment's JSON config, the definition, and archiving. They act
 * at three different scopes (one environment / the project / the whole flag), and
 * stacking them made every one of them look like the same size of decision. Tabs
 * name the scope you are in.
 *
 * The active tab is a search param rather than component state because the most
 * common way this page is opened is a link someone pasted into an incident
 * channel. `?tab=config` has to land on the config, or the link only works for the
 * person who sent it. `replace: true` on the write: switching tabs is not
 * navigation, and without it Back walks the tab history instead of returning to
 * the flag list.
 *
 * ## Why the flag row is fetched here rather than in the State tab
 *
 * The header's status badge and the State tab's controls have to agree, including
 * during the optimistic window `useFlagPatch` opens. One `useQuery` on
 * `['flags', envId]` (the cache entry the list page already fills) feeding both
 * makes that structural instead of coincidental.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';

import { api } from '@/api/client';
import { flagDetailQueryOptions, flagKeys, flagsQueryOptions } from '@/api/flags';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorNote } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { useToast } from '@/ui/toast';

import { FlagConfigPanel } from './detail/FlagConfigPanel';
import { FlagDetailHeader } from './detail/FlagDetailHeader';
import { FlagEnvironmentsPanel } from './detail/FlagEnvironmentsPanel';
import { FlagSettingsPanel } from './detail/FlagSettingsPanel';
import { FlagStatePanel } from './detail/FlagStatePanel';

const TABS = ['state', 'environments', 'config', 'settings'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  state: 'State',
  environments: 'Environments',
  config: 'Config',
  settings: 'Settings',
};

const isTab = (value: string | null): value is Tab => TABS.includes(value as Tab);

export function FlagDetailPage() {
  const { flagId } = useParams<{ flagId: string }>();
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const canEdit = ws.role === 'admin' || ws.role === 'developer';

  const flagQuery = useQuery(flagDetailQueryOptions(flagId));
  const flagsQuery = useQuery(flagsQueryOptions(ws.environmentId));

  const archive = useMutation({
    // `flagKey` rides along only so the toast can name the flag; the request body
    // is still just `{ archived }`.
    mutationFn: ({ archived }: { archived: boolean; flagKey: string }) =>
      api.patch(`/v1/tools/${flagId}`, { archived }),
    onSuccess: async (_data, { archived, flagKey }) => {
      toast(`${flagKey} ${archived ? 'archived' : 'restored'}`);
      await queryClient.invalidateQueries({ queryKey: flagKeys.detail(flagId) });
      await queryClient.invalidateQueries({ queryKey: flagKeys.listPrefix });
      await queryClient.invalidateQueries({ queryKey: flagKeys.definitionsPrefix });
    },
  });

  const requested = params.get('tab');
  // An unknown tab falls back rather than 404s: the tab names are part of a URL
  // people share, and renaming one later must not break links that predate it.
  const tab: Tab = isTab(requested) ? requested : 'state';

  const flag = flagQuery.data;
  if (!flagId) return null;
  if (flagQuery.error) return <ErrorNote error={flagQuery.error} />;
  if (!flag) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading flag">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const state = flagsQuery.data?.find((row) => row.id === flagId);

  return (
    <>
      <FlagDetailHeader
        flag={flag}
        state={state}
        canEdit={canEdit}
        onArchive={(archived) => archive.mutate({ archived, flagKey: flag.key })}
      />
      <ErrorNote error={archive.error} />

      <Tabs value={tab} onValueChange={(next) => setParams({ tab: next }, { replace: true })}>
        <TabsList variant="line" className="mb-1">
          {TABS.map((name) => (
            <TabsTrigger key={name} value={name}>
              {TAB_LABELS[name]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="state">
          <FlagStatePanel
            flag={flag}
            state={state}
            pending={flagsQuery.isPending}
            // Archiving is what unlocks the state controls again, so the reason
            // they are locked is one click away rather than a mystery.
            canEdit={canEdit && !flag.archived}
          />
        </TabsContent>
        <TabsContent value="environments">
          <FlagEnvironmentsPanel flag={flag} />
        </TabsContent>
        <TabsContent value="config">
          <FlagConfigPanel flagId={flagId} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="settings">
          <FlagSettingsPanel
            flag={flag}
            canEdit={canEdit}
            onArchive={(archived) => archive.mutate({ archived, flagKey: flag.key })}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
