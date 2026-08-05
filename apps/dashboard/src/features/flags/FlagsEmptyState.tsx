/**
 * The four screens the Flags page shows when it has no rows, and the one rule
 * they share: each names the single next action and offers it *here*, rather
 * than describing where else in the chrome to find it.
 *
 * ## Why these are not a skeleton
 *
 * `flagsQueryOptions` is `enabled: environmentId !== null`, and a disabled
 * react-query stays `status: 'pending'` forever. So a user with no project - the
 * state every new organization starts in - used to get the flags table's loading
 * skeleton indefinitely: eight grey rows implying data was on its way, for a
 * request that was never going to be made. The page therefore decides on the
 * workspace *before* it looks at the query, which is the same order `HomePage`
 * settles in.
 *
 * ## Why the project CTA is the topbar's own dialog
 *
 * `NameDialog` with `ws.createProject` is exactly what the org/project picker
 * runs, labels and hint included. Reusing it means a first-time user creates a
 * project from the page they landed on and lands back on a working Flags page,
 * with no second implementation of the flow to keep in step.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { NameDialog } from '@/components/nav/CreateScopeDialogs';
import { EmptyState } from '@/components/page';
import { useWorkspace } from '@/state/WorkspaceContext';
import { FlagIcon, FolderIcon, GlobeIcon, PlusIcon } from '@/ui/icons';
import { useToast } from '@/ui/toast';

/**
 * What a flag actually does, in the order it happens.
 *
 * Three lines, because the empty Flags page is where someone decides whether
 * this product does the thing they came for, and "no flags yet" alone does not
 * answer that. Deliberately not a link to docs that do not exist yet.
 */
const FIRST_FLAG_STEPS = [
  {
    title: 'Create a flag',
    body: 'Give it a key your code can address, and a type — a switch, a string, or one of a fixed set of choices.',
  },
  {
    title: 'Read it from your SDK',
    body: 'Every environment gets the flag with its default value, so a deploy that reads it is safe before you touch anything here.',
  },
  {
    title: 'Change it without a deploy',
    body: 'Flip it off, roll it out to a percentage, or target a segment. The change reaches your SDKs in seconds.',
  },
];

/** No project in this organization - nothing about flags is reachable yet. */
export function NoProjectState() {
  const ws = useWorkspace();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  /*
   * `orgId` is checked as well as the role: with no organization at all there is
   * no URL to POST a project to, and a CTA that 404s is worse than no CTA. The
   * org itself is created from the topbar picker, which is the only place that
   * flow lives.
   */
  const canCreate = ws.role === 'admin' && ws.orgId !== null;

  return (
    <>
      <EmptyState
        icon={FolderIcon}
        title={
          ws.orgId === null
            ? 'Create an organization to start using flags'
            : 'Create a project to start using flags'
        }
        description={
          ws.orgId === null
            ? 'Flags live inside a project, and a project lives inside an organization. Create one from the organization picker in the top bar.'
            : canCreate
              ? 'Flags live inside a project, alongside its own environments. A new project starts with Production; add more environments whenever you need them.'
              : 'No projects exist in this organization yet, and flags live inside a project. An admin needs to create the first one.'
        }
        action={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <PlusIcon size={14} /> Create project
            </Button>
          )
        }
      />
      {creating && (
        <NameDialog
          title="New project"
          label="Name"
          placeholder="Checkout service"
          hint="Starts with a Production environment. Add more from the environment switcher."
          submitLabel="Create project"
          onCreate={(name) => ws.createProject(name).then(() => toast(`Project “${name}” created`))}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

/**
 * A project with no environments. Rare - the API creates Production with the
 * project - but reachable by deleting the last one, and a flag has nowhere to be
 * on or off until it is fixed.
 */
export function NoEnvironmentState() {
  const ws = useWorkspace();
  return (
    <EmptyState
      icon={GlobeIcon}
      title={`${ws.project?.name ?? 'This project'} has no environments`}
      description="A flag is on or off per environment, so there is nothing to show until this project has at least one."
      action={
        <Button variant="outline" asChild>
          <Link to="/environments">Manage environments</Link>
        </Button>
      }
    />
  );
}

/** The project and environment exist; nobody has created a flag yet. */
export function NoFlagsState({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  const ws = useWorkspace();

  return (
    <EmptyState
      icon={FlagIcon}
      title={`No flags in ${ws.project?.name ?? 'this project'} yet`}
      description={
        canEdit
          ? 'A flag is a switch your app reads at runtime — a kill switch, a staged rollout, or a value you want to change without a deploy.'
          : 'A flag is a switch your app reads at runtime. You need the developer or admin role to create one.'
      }
      action={
        canEdit && (
          <Button onClick={onCreate}>
            <PlusIcon size={14} /> Create your first flag
          </Button>
        )
      }
    >
      {/* An ordered list, not three cards: these are steps in sequence, and a
          row of equal-weight cards says they are alternatives. */}
      <ol className="mt-6 grid w-full max-w-3xl list-none grid-cols-1 gap-3 p-0 text-left sm:grid-cols-3">
        {FIRST_FLAG_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="border-border bg-bg2/50 flex flex-col gap-1 rounded-lg border p-3"
          >
            <span className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-[0.04em] uppercase">
              <span className="bg-primary/10 text-primary flex size-4 items-center justify-center rounded-full text-[10px] tabular-nums">
                {index + 1}
              </span>
              {step.title}
            </span>
            <span className="text-muted-foreground text-[12.5px] leading-snug">{step.body}</span>
          </li>
        ))}
      </ol>
    </EmptyState>
  );
}

/**
 * Rows exist, but the filters admit none of them. A different screen from the
 * three above, because the remedy is different: those want something created,
 * this wants a filter cleared.
 */
export function NoMatchesState({
  total,
  onClear,
  icon,
}: {
  total: number;
  onClear: () => void;
  icon: Parameters<typeof EmptyState>[0]['icon'];
}) {
  return (
    <EmptyState
      icon={icon}
      title="Nothing matches these filters"
      description={`${total} ${total === 1 ? 'flag' : 'flags'} in this environment, none of them matching.`}
      action={
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}
