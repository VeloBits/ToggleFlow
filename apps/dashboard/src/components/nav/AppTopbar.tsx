/**
 * The authenticated top bar: brand, then the Org → Project → Environment
 * scope chain, and nothing else.
 *
 * Identity, role, theme and sign-out used to live up here; they are account
 * controls, not navigation, and they now sit at the foot of the sidebar
 * (AppSidebar) where every SaaS product of the last decade has taught people
 * to look for them. What is left is the answer to one question - "what am I
 * looking at?" - which is the only thing a top bar in a scoped product owes
 * the user.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useWorkspace } from '../../state/WorkspaceContext';
import { cn } from '../../ui/cn';
import { BuildingIcon, FolderIcon, MenuIcon, PlusIcon, ToggleMarkIcon } from '../../ui/icons';
import { useToast } from '../../ui/toast';
import { CreateEnvironmentDialog, NameDialog } from './CreateScopeDialogs';
import { environmentTone } from './environment-tone';
import { ScopePicker, ScopeSeparator } from './ScopePicker';

type Creating = 'org' | 'project' | 'environment' | null;

const ADMIN_ONLY = 'Only organization admins can do this.';

export function AppTopbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const ws = useWorkspace();
  const toast = useToast();
  const [creating, setCreating] = useState<Creating>(null);
  const close = () => setCreating(null);

  const isAdmin = ws.role === 'admin';
  const hasProject = ws.projectId !== null;

  return (
    <header className="border-border bg-panel flex h-13 shrink-0 items-center gap-1 border-b px-3 sm:px-4">
      {/* The drawer trigger only exists below `md`, where the sidebar is an
          overlay rather than a column. */}
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation menu"
        className="text-muted hover:bg-highlight hover:text-text focus-visible:ring-accent -ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:outline-none md:hidden"
      >
        <MenuIcon size={18} />
      </button>

      <Link
        to="/"
        className="focus-visible:ring-accent flex shrink-0 items-center gap-2 rounded-md px-1 py-1 focus-visible:ring-2 focus-visible:outline-none"
      >
        <ToggleMarkIcon size={20} className="text-accent" />
        {/* The wordmark yields before the scope chain does: below `sm` the mark
            alone still identifies the product, but a truncated project name
            identifies nothing. */}
        <span className="text-text hidden text-[15px] font-bold sm:inline">ToggleFlow</span>
      </Link>

      <span aria-hidden className="bg-border mx-1.5 hidden h-5 w-px sm:block" />

      {/*
        Horizontally scrollable rather than wrapping: the bar is a fixed 52px
        row that the page grid is measured against, so a second line would
        shift every page underneath it. Three long names on a phone scroll.
      */}
      <nav
        aria-label="Scope"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ScopePicker
          kind="Organization"
          icon={BuildingIcon}
          options={(ws.me?.orgs ?? []).map((org) => ({
            id: org.id,
            label: org.name,
            meta: org.role,
          }))}
          selectedId={ws.orgId}
          onSelect={ws.selectOrg}
          onCreate={() => setCreating('org')}
          createLabel="Create organization"
          loading={!ws.ready}
        />

        {/*
          No project yet is not a "pick one" state, it is the next thing the
          user has to do - so the picker gives way to the action itself rather
          than hiding it one click deep inside an empty dropdown.
        */}
        {ws.ready && ws.projects.length === 0 ? (
          <>
            <ScopeSeparator />
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setCreating('project')}
                className="border-accent bg-accent hover:bg-accent-hover hover:border-accent-hover focus-visible:ring-accent focus-visible:ring-offset-panel ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap text-white transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
              >
                <PlusIcon size={14} />
                Create project
              </button>
            ) : (
              <span className="text-muted ml-1 px-2 text-[13px] whitespace-nowrap">
                No projects yet
              </span>
            )}
          </>
        ) : (
          <>
            <ScopeSeparator />
            <ScopePicker
              kind="Project"
              icon={FolderIcon}
              options={ws.projects.map((project) => ({ id: project.id, label: project.name }))}
              selectedId={ws.projectId}
              onSelect={ws.selectProject}
              onCreate={isAdmin ? () => setCreating('project') : undefined}
              createDisabledReason={ADMIN_ONLY}
              createLabel="Create project"
              loading={!ws.ready}
            />

            {hasProject && (
              <>
                <ScopeSeparator />
                <ScopePicker
                  kind="Environment"
                  options={ws.environments.map((environment) => ({
                    id: environment.id,
                    label: environment.name,
                    meta: environment.key,
                    dotClassName: environmentTone(environment.key).dot,
                  }))}
                  selectedId={ws.environmentId}
                  onSelect={ws.selectEnvironment}
                  onCreate={isAdmin ? () => setCreating('environment') : undefined}
                  createDisabledReason={ADMIN_ONLY}
                  createLabel="Create environment"
                  loading={ws.environments.length === 0 && ws.loading}
                />
              </>
            )}
          </>
        )}
      </nav>

      {creating === 'org' && (
        <NameDialog
          title="New organization"
          label="Name"
          placeholder="Acme Inc"
          hint="You will be its first admin. Projects, members and billing are scoped to an organization."
          submitLabel="Create organization"
          onCreate={(name) =>
            ws.createOrg(name).then(() => toast(`Switched to ${name}. Create a project to begin.`))
          }
          onClose={close}
        />
      )}
      {creating === 'project' && (
        <NameDialog
          title="New project"
          label="Name"
          placeholder="Checkout service"
          hint="Starts with a Production environment. Add more from the environment switcher."
          submitLabel="Create project"
          onCreate={(name) => ws.createProject(name).then(() => toast(`Project “${name}” created`))}
          onClose={close}
        />
      )}
      {creating === 'environment' && (
        <CreateEnvironmentDialog
          onCreate={(input) =>
            ws.createEnvironment(input).then(() => toast(`Environment “${input.name}” created`))
          }
          onClose={close}
        />
      )}
    </header>
  );
}

/** Exported for the sidebar's mobile drawer header, which repeats the brand. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <ToggleMarkIcon size={20} className="text-accent" />
      <span className="text-text text-[15px] font-bold">ToggleFlow</span>
    </span>
  );
}
