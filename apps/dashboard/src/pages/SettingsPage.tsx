/**
 * Project and organization settings.
 *
 * Both scopes on one page because there are only a handful of fields between
 * them and splitting them would mean two nav rows for two forms. The page
 * makes the boundary explicit instead, with the scope named in each section
 * heading - which matters, because renaming a project and renaming the
 * organization look identical and are not.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
} from '@velobits-dev/ui';
import { useEffect, useState } from 'react';

import { api, type Project } from '../api/client';
import { PageHeader, Panel } from '../components/page';
import { ConfirmButton, ErrorNote } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { useToast } from '../ui/toast';

function ProjectSettings() {
  const ws = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = ws.role === 'admin';
  const [name, setName] = useState(ws.project?.name ?? '');

  // The field is uncontrolled with respect to the query until the project
  // changes underneath it - switching projects in the top bar has to reload
  // the form rather than leave the previous project's name sitting in it.
  useEffect(() => setName(ws.project?.name ?? ''), [ws.projectId, ws.project?.name]);

  const rename = useMutation({
    mutationFn: (next: string) =>
      api.patch<Project>(`/v1/projects/${ws.projectId}`, { name: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects', ws.orgId] });
      toast('Project renamed');
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/v1/projects/${ws.projectId}`),
    onSuccess: async () => {
      // Clear the remembered selection first, or the workspace will try to
      // reselect a project that no longer exists.
      localStorage.removeItem('tf.project');
      localStorage.removeItem('tf.environment');
      await queryClient.invalidateQueries({ queryKey: ['projects', ws.orgId] });
      toast('Project deleted');
    },
  });

  if (!ws.projectId) return null;
  const trimmed = name.trim();
  const changed = trimmed.length > 0 && trimmed !== ws.project?.name;

  return (
    <>
      <Panel title="Project" className="mb-4">
        <form
          className="flex flex-col items-start gap-4 p-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (changed && !rename.isPending) rename.mutate(trimmed);
          }}
        >
          {/*
            The read-only explanation is a `FieldDescription` rather than a loose
            paragraph, so it is wired into the input's `aria-describedby` - the
            disabled state on its own says the field cannot be edited, never why.
          */}
          <Field id="project-rename" className="w-full max-w-md" describedBy={!isAdmin}>
            <FieldLabel>Name</FieldLabel>
            <FieldControl>
              <Input
                value={name}
                maxLength={200}
                disabled={!isAdmin}
                onChange={(e) => setName(e.target.value)}
              />
            </FieldControl>
            {!isAdmin && (
              <FieldDescription>Only organization admins can rename a project.</FieldDescription>
            )}
          </Field>
          <ErrorNote error={rename.error} />
          {isAdmin && (
            <Button type="submit" variant="primary" disabled={!changed || rename.isPending}>
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
          )}
        </form>
      </Panel>

      {isAdmin && (
        <Panel title="Danger zone" className="border-danger/40 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-fg m-0 text-[13px] font-medium">Delete this project</p>
              <p className="text-muted-foreground m-0 mt-0.5 text-[12.5px]">
                Removes {ws.project?.name} with all of its flags, environments, API keys and config
                history. This cannot be undone.
              </p>
            </div>
            <ErrorNote error={remove.error} />
            <ConfirmButton
              variant="destructive"
              label="Delete project"
              confirmLabel="Delete permanently?"
              onConfirm={() => remove.mutate()}
            />
          </div>
        </Panel>
      )}
    </>
  );
}

function OrganizationSettings() {
  const ws = useWorkspace();
  if (!ws.org) return null;

  return (
    <Panel title="Organization">
      {/*
        Still a `<dl>`: these are four labelled facts, not a form and not a
        table, and the description-list is the element that says so. Only the
        paint moved onto tokens.
      */}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 p-4 text-[13px]">
        <dt className="text-muted-foreground">Name</dt>
        <dd className="text-fg m-0">{ws.org.name}</dd>
        <dt className="text-muted-foreground">Your role</dt>
        <dd className="m-0">
          <Badge variant="primary">{ws.role}</Badge>
        </dd>
        <dt className="text-muted-foreground">Projects</dt>
        <dd className="text-fg m-0">{ws.projects.length}</dd>
        <dt className="text-muted-foreground">Organization ID</dt>
        <dd className="text-fg m-0 font-mono text-[12.5px]">{ws.org.id}</dd>
      </dl>
      <p className="text-muted-foreground border-border m-0 border-t px-4 py-2.5 text-[12.5px]">
        Renaming and deleting an organization are not available yet. Members and roles are managed
        on the Team page.
      </p>
    </Panel>
  );
}

export function SettingsPage() {
  const ws = useWorkspace();
  return (
    <>
      <PageHeader
        title="Settings"
        description={
          ws.project
            ? `Configuration for ${ws.project.name} and ${ws.org?.name ?? 'this organization'}.`
            : 'Organization configuration.'
        }
      />
      <ProjectSettings />
      <OrganizationSettings />
    </>
  );
}
