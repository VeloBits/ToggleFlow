/**
 * Environments for the current project: the surface that makes "Production
 * only by default" workable, since dev and staging are now something you add
 * rather than something you are given.
 *
 * Renaming is a PATCH of the display name; the key is immutable because SDKs
 * address environments by it. Deleting takes the environment's flag states,
 * config and keys with it, so it is behind the two-step ConfirmButton and
 * refused outright for the environment you are currently in - switching first
 * makes the consequence visible instead of silently relocating you.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, type Environment } from '../api/client';
import {
  CreateEnvironmentDialog,
  environmentCreatedMessage,
} from '../components/nav/CreateScopeDialogs';
import { environmentTone } from '../components/nav/environment-tone';
import { EmptyState, PageHeader, Panel } from '../components/page';
import { ConfirmButton, ErrorNote } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { cn } from '../ui/cn';
import { LayersIcon, PlusIcon } from '../ui/icons';
import { useToast } from '../ui/toast';

export function EnvironmentsPage() {
  const ws = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = ws.role === 'admin';
  /**
   * Non-null while the dialog is open, carrying which environment it should
   * offer to inherit from - `null` inside means "blank". A bare boolean could
   * not express "open, defaulting to blank".
   */
  const [creating, setCreating] = useState<{ inheritFromId: string | null } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const environmentsQuery = useQuery({
    queryKey: ['environments', ws.projectId],
    queryFn: () => api.get<Environment[]>(`/v1/projects/${ws.projectId}/environments`),
    enabled: ws.projectId !== null,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['environments', ws.projectId] });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/v1/environments/${id}`, { name }),
    onSuccess: async () => {
      await invalidate();
      setRenaming(null);
      toast('Environment renamed');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/v1/environments/${id}`),
    onSuccess: async () => {
      await invalidate();
      toast('Environment deleted');
    },
  });

  const environments = environmentsQuery.data ?? [];

  if (!ws.projectId) {
    return (
      <>
        <PageHeader title="Environments" />
        <Panel>
          <EmptyState
            icon={LayersIcon}
            title="No project selected"
            description="Environments belong to a project. Create one from the top bar to get started."
          />
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Environments"
        description={
          <>
            Separate copies of every flag and config in{' '}
            <strong className="text-text font-medium">{ws.project?.name}</strong>. Each has its own
            API keys and its own published ruleset.
          </>
        }
        actions={
          isAdmin && (
            <button
              type="button"
              className="primary"
              onClick={() => setCreating({ inheritFromId: ws.environmentId })}
            >
              <PlusIcon size={14} className="mr-1 inline align-[-2px]" />
              New environment
            </button>
          )
        }
      />

      <ErrorNote error={environmentsQuery.error ?? rename.error ?? remove.error} />

      <Panel>
        {environments.length === 0 ? (
          <EmptyState
            icon={LayersIcon}
            title="No environments"
            description="Every project needs at least one. Production is created with the project by default."
          />
        ) : (
          <ul className="m-0 list-none p-0">
            {environments.map((environment) => {
              const tone = environmentTone(environment.key);
              const isCurrent = environment.id === ws.environmentId;
              const isOnly = environments.length === 1;
              return (
                <li
                  key={environment.id}
                  className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', tone.dot)} />

                  {renaming === environment.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = draftName.trim();
                        if (name) rename.mutate({ id: environment.id, name });
                      }}
                    >
                      <label className="sr-only" htmlFor={`rename-${environment.id}`}>
                        New name for {environment.name}
                      </label>
                      <input
                        id={`rename-${environment.id}`}
                        autoFocus
                        value={draftName}
                        maxLength={200}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="min-w-0 flex-1"
                      />
                      <button
                        type="submit"
                        className="primary"
                        disabled={!draftName.trim() || rename.isPending}
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setRenaming(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-text m-0 truncate text-[13.5px] font-medium">
                          {environment.name}
                          {isCurrent && (
                            <span className="text-muted-foreground ml-2 text-[11.5px] font-normal">
                              current
                            </span>
                          )}
                        </p>
                        <p className="mono text-muted-foreground m-0">{environment.key}</p>
                      </div>

                      {!isCurrent && (
                        <button type="button" onClick={() => ws.selectEnvironment(environment.id)}>
                          Switch to
                        </button>
                      )}
                      {isAdmin && (
                        <>
                          {/* The shortest path to "another environment like this
                              one" - opens the create dialog with this row
                              pre-selected as the inheritance source. */}
                          <button
                            type="button"
                            onClick={() => setCreating({ inheritFromId: environment.id })}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenaming(environment.id);
                              setDraftName(environment.name);
                            }}
                          >
                            Rename
                          </button>
                          {/*
                            Refusing to delete the current or the last
                            environment is a guard, not a permission - so the
                            control stays visible and explains itself rather
                            than disappearing and leaving the user to guess.
                          */}
                          <span
                            title={
                              isOnly
                                ? 'A project must keep at least one environment.'
                                : isCurrent
                                  ? 'Switch to another environment before deleting this one.'
                                  : undefined
                            }
                          >
                            <ConfirmButton
                              className="danger"
                              label="Delete"
                              confirmLabel="Delete for good?"
                              disabled={isOnly || isCurrent}
                              onConfirm={() => remove.mutate(environment.id)}
                            />
                          </span>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {creating && (
        <CreateEnvironmentDialog
          environments={environments}
          defaultInheritFromId={creating.inheritFromId}
          onCreate={(input) =>
            ws.createEnvironment(input).then((created) => {
              toast(environmentCreatedMessage(created));
              return created;
            })
          }
          onClose={() => setCreating(null)}
        />
      )}
    </>
  );
}
