/**
 * The Settings tab: the project-scoped *definition*, not any environment's state.
 *
 * The split is the whole point of having a tab for it. Name, key, type, options
 * and default value are one row in `tools` shared by every environment; changing
 * the type or the default here changes what every environment inherits, which is
 * a categorically bigger act than flipping one switch. Putting it behind its own
 * tab - and behind a dialog rather than inline fields - is what keeps the two
 * from feeling like the same edit.
 */
import { useState, type ReactNode } from 'react';

import { flagType } from '@toggleflow/engine';

import type { FlagDefinitionDetail } from '@/api/client';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Panel } from '@/components/page';
import { ConfirmButton } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { PencilIcon } from '@/ui/icons';

import { FlagFormDialog } from '../FlagFormDialog';
import type { FlagRow } from '../flag-columns';

/**
 * `FlagFormDialog` takes a `FlagRow` - a definition joined to ONE environment's
 * state - because that is the shape the list page has to hand. Only the
 * definition half is ever read (`initialStateFor`), so the per-environment half
 * is filled with inert values rather than with the selected environment's real
 * state: passing the real state would imply the dialog can change it, and it
 * cannot.
 */
function definitionAsRow(flag: FlagDefinitionDetail): FlagRow {
  const { flagStates: _flagStates, metadata: _metadata, ...definition } = flag;
  return { ...definition, enabled: false, rolloutPercent: null, targetingRules: [], value: null };
}

export function FlagSettingsPanel({
  flag,
  canEdit,
  onArchive,
}: {
  flag: FlagDefinitionDetail;
  canEdit: boolean;
  onArchive: (archived: boolean) => void;
}) {
  const ws = useWorkspace();
  const [editing, setEditing] = useState(false);
  const descriptor = flagType(flag.valueType);

  /*
   * Guarded rather than optional-chained: `FlagFormDialog` PATCHes a
   * project-scoped route, so there is no meaningful version of this panel
   * without a project. The flag detail query needs only the flag id, so this
   * tab really can paint before /v1/me → projects has resolved - a deep link to
   * `?tab=settings` does exactly that.
   */
  const projectId = ws.projectId;
  if (!projectId) {
    return (
      <Panel title="Definition">
        <div className="p-4" role="status" aria-label="Loading project">
          <Skeleton className="h-24 w-full" />
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Definition"
        actions={
          canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon size={13} /> Edit definition
            </Button>
          )
        }
      >
        <dl className="m-0 grid gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-2">
          <Fact label="Key" mono>
            {flag.key}
          </Fact>
          <Fact label="Name">{flag.name}</Fact>
          <Fact label="Type">{descriptor.label}</Fact>
          <Fact label="Default value" mono>
            {descriptor.format(flag.defaultValue)}
          </Fact>
          <Fact label="Options" mono>
            {flag.enumOptions.length > 0 ? flag.enumOptions.join(', ') : '—'}
          </Fact>
          <Fact label="Last changed">{new Date(flag.updatedAt).toLocaleString()}</Fact>
        </dl>
      </Panel>

      <Panel title="Archive">
        <div className="flex flex-col items-start gap-3 p-4">
          <p className="text-muted-foreground m-0 text-[13px]">
            {/* Named for what it does to running code, not for what it does to
                this list. An archived flag disappears from published snapshots,
                so every SDK silently reverts to the default in your source - which
                is the safe outcome only if that default is still the right one. */}
            Archiving hides this flag and drops it from published snapshots, so SDKs fall back to
            the default in your code. The definition, its history and its config are all kept, and
            restoring puts it back exactly as it was.
          </p>
          {canEdit && (
            <ConfirmButton
              className={buttonVariants({
                variant: flag.archived ? 'outline' : 'destructive',
                size: 'sm',
              })}
              label={flag.archived ? 'Restore this flag' : 'Archive this flag'}
              confirmLabel={flag.archived ? 'Yes, restore it' : 'Yes, archive it'}
              onConfirm={() => onArchive(!flag.archived)}
            />
          )}
        </div>
      </Panel>

      {editing && (
        <FlagFormDialog
          mode="edit"
          projectId={projectId}
          flag={definitionAsRow(flag)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function Fact({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground m-0 text-[12px]">{label}</dt>
      <dd className={`text-text m-0 mt-0.5 break-words ${mono ? 'font-mono text-[12.5px]' : ''}`}>
        {children}
      </dd>
    </div>
  );
}
