/**
 * What the Segments page shows with no rows.
 *
 * Same rule as `FlagsEmptyState`: name the one next action and offer it here. And
 * the same ordering constraint - `segmentsQueryOptions` is disabled without a
 * project, and a disabled react-query is `isPending` forever, so the page must
 * decide on the workspace BEFORE consulting the query or a project-less
 * organization sits in front of a skeleton for a request that was never made.
 */
import { Button } from '@/components/ui/button';
import { NameDialog } from '@/components/nav/CreateScopeDialogs';
import { EmptyState } from '@/components/page';
import { useWorkspace } from '@/state/WorkspaceContext';
import { FilterIcon, FolderIcon, LayersIcon, PlusIcon } from '@/ui/icons';
import { useToast } from '@/ui/toast';
import { useState } from 'react';

/**
 * What a segment is FOR, in the order it happens. The empty page is where someone
 * decides whether this concept is worth learning, and "no segments yet" does not
 * answer that.
 */
const FIRST_SEGMENT_STEPS = [
  'Describe a group of users once — say, everyone on a paid plan in the EU.',
  'Point any number of flags at it instead of repeating the same conditions.',
  'Change the group in one place and every flag targeting it follows.',
];

export function NoSegmentsState({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  return (
    <EmptyState
      icon={LayersIcon}
      title="No segments yet"
      description={
        canEdit
          ? 'A segment is a reusable group of users that flags can target.'
          : 'A segment is a reusable group of users that flags can target. Ask an admin or developer to create one.'
      }
      action={
        canEdit && (
          <Button onClick={onCreate}>
            <PlusIcon size={14} /> Create segment
          </Button>
        )
      }
    >
      <ul className="text-muted-foreground mt-3 max-w-md list-none space-y-1 p-0 text-left text-[12.5px]">
        {FIRST_SEGMENT_STEPS.map((step, index) => (
          <li key={step} className="flex gap-2">
            <span aria-hidden className="text-border tabular-nums select-none">
              {index + 1}.
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
    </EmptyState>
  );
}

/** Filtered to nothing - offers the way back rather than looking like an empty project. */
export function NoSegmentMatchesState({ total, onClear }: { total: number; onClear: () => void }) {
  return (
    <EmptyState
      icon={FilterIcon}
      title="No segments match"
      description={`None of the ${total} segments in this project match your search.`}
      action={
        <Button variant="outline" onClick={onClear}>
          Clear search
        </Button>
      }
    />
  );
}

/**
 * No project at all. The CTA is the topbar's own dialog, so a first-time user
 * creates a project from the page they landed on and there is no second
 * implementation of the flow to keep in step.
 */
export function NoProjectState() {
  const ws = useWorkspace();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <>
      <EmptyState
        icon={FolderIcon}
        title="No project yet"
        description="Segments belong to a project, so there is nowhere to put one until you have created it."
        action={
          <Button onClick={() => setOpen(true)}>
            <PlusIcon size={14} /> Create a project
          </Button>
        }
      />
      {open && (
        <NameDialog
          title="Create a project"
          label="Project name"
          placeholder="Mobile app"
          hint="Environments are created with it."
          submitLabel="Create project"
          onCreate={async (name) => {
            await ws.createProject(name);
            toast(`${name} created`);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
