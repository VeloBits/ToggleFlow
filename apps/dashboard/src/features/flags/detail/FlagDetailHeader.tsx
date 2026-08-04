/**
 * The flag detail header: where you are, what this flag is, and what state it is
 * in *here*.
 *
 * The environment name and its colour dot sit in the header rather than only in
 * the topbar because everything below this line except the Environments tab acts
 * on one environment, and "edited the wrong environment" is the category's
 * defining catastrophic error (see `components/nav/environment-tone.ts`). The
 * status badge is fed from the same `['flags', envId]` row the State tab edits,
 * not from the detail response's `flagStates`, so a kill-switch flip moves this
 * badge in the same optimistic paint as the switch itself.
 */
import { Link } from 'react-router-dom';

import type { Flag, FlagDefinitionDetail } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { environmentTone } from '@/components/nav/environment-tone';
import { ConfirmButton } from '@/components/ui';
import { useWorkspace } from '@/state/WorkspaceContext';
import { CopyIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';
import { useToast } from '@/ui/toast';

import { FlagStatusBadge } from '../FlagStatusBadge';
import { FlagTypeBadge } from '../FlagTypeBadge';

export function FlagDetailHeader({
  flag,
  state,
  canEdit,
  onArchive,
}: {
  flag: FlagDefinitionDetail;
  /** This environment's row, absent until the flag list has answered. */
  state: Flag | undefined;
  canEdit: boolean;
  onArchive: (archived: boolean) => void;
}) {
  const ws = useWorkspace();
  const toast = useToast();

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-[12.5px]">
          <Link to="/flags" className="hover:text-text underline-offset-2 hover:underline">
            Flags
          </Link>
          <span aria-hidden>/</span>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* The key, not the name, is the breadcrumb leaf: it is the string
                  that goes into an SDK call, so the place it is displayed is the
                  place it should be copyable from. */}
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Copy key ${flag.key}`}
                className="-mx-1.5 max-w-full gap-1.5 font-mono text-[12.5px] font-normal"
                onClick={() => {
                  void navigator.clipboard?.writeText(flag.key);
                  toast(`Copied ${flag.key}`);
                }}
              >
                <span className="truncate">{flag.key}</span>
                <CopyIcon size={12} className="shrink-0 opacity-60" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy this key for your SDK call</TooltipContent>
          </Tooltip>
        </div>

        <h1 className="text-text m-0 mt-0.5 text-[20px] leading-tight font-bold">{flag.name}</h1>
        {flag.description && (
          <p className="text-muted-foreground m-0 mt-1 text-[13px]">{flag.description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {state && (
            <FlagStatusBadge
              flag={{
                enabled: state.enabled,
                rolloutPercent: state.rolloutPercent,
                archived: flag.archived,
              }}
            />
          )}
          <FlagTypeBadge valueType={flag.valueType} />
          {ws.environment && (
            <Badge variant="outline" className="text-muted-foreground gap-1.5 font-normal">
              <span
                aria-hidden
                className={cn('size-2 rounded-full', environmentTone(ws.environment.key).dot)}
              />
              {ws.environment.name}
            </Badge>
          )}
          {flag.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {canEdit && (
        <ConfirmButton
          className={buttonVariants({
            variant: flag.archived ? 'outline' : 'destructive',
            size: 'sm',
          })}
          label={flag.archived ? 'Restore' : 'Archive'}
          confirmLabel={flag.archived ? 'Restore?' : 'Archive (drops from snapshots)?'}
          onConfirm={() => onArchive(!flag.archived)}
        />
      )}
    </div>
  );
}
