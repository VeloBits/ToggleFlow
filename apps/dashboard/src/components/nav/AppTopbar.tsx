/**
 * The authenticated top bar's contents: the Org → Project → Environment scope
 * chain, and nothing else.
 *
 * Identity, role, theme and sign-out used to live up here; they are account
 * controls, not navigation, and they now sit at the foot of the sidebar
 * (AppSidebar) where every SaaS product of the last decade has taught people to
 * look for them. What is left is the answer to one question — "what am I looking
 * at?" — which is the only thing a top bar in a scoped product owes the user.
 *
 * ## Why this is no longer a `<header>`
 *
 * `AppShellHeader` is the bar itself: it owns the sticky positioning, the 52px
 * height, the surface and the z-index step that keeps it below its own
 * dropdowns. The hamburger is `AppShellSidebarTrigger`, which is a real Radix
 * trigger and so carries `aria-expanded`, `aria-controls` and the focus return
 * that a hand-rolled button had no way to. Both are composed in `Layout`.
 *
 * What is left here is the part that knows about the workspace.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BuildingIcon, FolderIcon, PlusIcon, ToggleMarkIcon } from '@velobits-dev/icons';
import { Button } from '@velobits-dev/ui';

import { useWorkspace } from '../../state/WorkspaceContext';
import { cn } from '../../ui/cn';
import { useToast } from '../../ui/toast';
import {
  CreateEnvironmentDialog,
  NameDialog,
  environmentCreatedMessage,
} from './CreateScopeDialogs';
import { environmentTone } from './environment-tone';
import { ScopePicker, ScopeSeparator } from './ScopePicker';

type Creating = 'org' | 'project' | 'environment' | null;

const ADMIN_ONLY = 'Only organization admins can do this.';

export function AppTopbarContent() {
  const ws = useWorkspace();
  const toast = useToast();
  const [creating, setCreating] = useState<Creating>(null);
  const close = () => setCreating(null);

  const isAdmin = ws.role === 'admin';
  const hasProject = ws.projectId !== null;

  return (
    <>
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
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreating('project')}
                className="ml-1 shrink-0 whitespace-nowrap"
              >
                <PlusIcon size={14} />
                Create project
              </Button>
            ) : (
              <span className="text-muted-foreground ml-1 px-2 text-[13px] whitespace-nowrap">
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
          environments={ws.environments}
          defaultInheritFromId={ws.environmentId}
          onCreate={(input) =>
            ws.createEnvironment(input).then((created) => {
              toast(environmentCreatedMessage(created));
              return created;
            })
          }
          onClose={close}
        />
      )}
    </>
  );
}

/**
 * The product mark. `asLink` renders it as the home link in the app bar; without
 * it, it is a plain label (the guest surfaces use that form).
 *
 * The wordmark yields before the scope chain does: below `sm` the mark alone
 * still identifies the product, but a truncated project name identifies nothing.
 *
 * ## Lime, and why it is a plate rather than a glyph
 *
 * The mark used to be `text-primary` — the same blue as the nav's active state,
 * the focus ring and every primary Button, so the one element on screen that is
 * pure identity was painted in the app's action colour. `--brand` is the token
 * that means "this product", and this is the surface it exists for.
 *
 * It has to be a fill, not a coloured glyph: `--brand` is lime, which measures
 * about 1.4:1 against a light panel and would effectively vanish. `--on-brand`
 * on `--brand` is the pair the design system gates for exactly this, and it is
 * legible by construction in both themes.
 */
export function BrandMark({ className, asLink = false }: { className?: string; asLink?: boolean }) {
  const content = (
    <>
      <span
        aria-hidden
        className="bg-brand text-on-brand grid size-6 shrink-0 place-items-center rounded-md"
      >
        <ToggleMarkIcon size={15} />
      </span>
      <span className={cn('text-fg text-[15px] font-bold', asLink && 'hidden sm:inline')}>
        ToggleFlow
      </span>
    </>
  );

  if (!asLink) return <span className={cn('flex items-center gap-2', className)}>{content}</span>;

  return (
    <Link
      to="/"
      className={cn(
        'focus-visible:ring-ring flex shrink-0 items-center gap-2 rounded-md px-1 py-1',
        'focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      {content}
    </Link>
  );
}
