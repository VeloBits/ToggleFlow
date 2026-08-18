/**
 * One event, in full, in a side panel.
 *
 * A side panel rather than a modal because the question people arrive with is
 * comparative - "is this the same change as the row above it?" - and a centred
 * modal covers the very table that holds the answer. The panel keeps the list
 * visible beside it and closes on Esc.
 *
 * Three tabs rather than one long scroll: the same payload answers three
 * different questions (what changed, exactly how it differs, what was literally
 * recorded), and stacking all three makes the first one - the one almost
 * everybody wants - the shortest and least prominent part of the page.
 */
import {
  Badge,
  SidePanel,
  SidePanelContent,
  SidePanelDescription,
  SidePanelHeader,
  SidePanelTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@velobits-dev/ui';
import { relativeTime } from '@/ui/relative-time';

import { AuditActionBadge } from './AuditActionBadge';
import { AuditChangesSection, AuditMetaGrid, AuditRawSection } from './AuditEventDetail';
import { AuditJsonDiff } from './AuditJsonDiff';
import type { AuditRow } from './audit-summary';

export function AuditDetailPanel({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  const { entry, summary } = row;

  return (
    /*
     * Controlled and rendered open, because the caller still mounts this only
     * while there is a row to show: `open` is a constant and `onOpenChange`
     * exists so Esc and the ✕ reach `onClose` rather than being swallowed by a
     * component that has no way to close itself.
     */
    <SidePanel
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/*
        `sm:max-w-xl` (576px) rather than the system's 448px default: this panel
        carries a metadata grid, a three-column change table and two JSON
        payloads, and `AuditRawSection`'s `columns={1}` below is calibrated
        against exactly this width.
      */}
      <SidePanelContent className="sm:max-w-xl">
        <SidePanelHeader>
          <SidePanelTitle className="flex flex-wrap items-center gap-2 text-[15px]">
            <AuditActionBadge meta={summary.meta} action={entry.action} />
            <span className="min-w-0">
              {summary.meta.subject} {summary.meta.verb}
            </span>
            {summary.target.name && (
              <Badge
                variant="outline"
                className={summary.target.mono ? 'font-mono font-normal' : 'font-normal'}
              >
                {summary.target.name}
              </Badge>
            )}
          </SidePanelTitle>
          <SidePanelDescription>
            {row.actor} ·{' '}
            <span title={new Date(entry.createdAt).toLocaleString()}>
              {relativeTime(entry.createdAt)}
            </span>
          </SidePanelDescription>
        </SidePanelHeader>

        {/*
          `SidePanelContent` is a non-scrolling flex column of definite height and
          it clips its overflow, so the scroll container has to be this child -
          which is also what keeps the ✕ and the header out of the scroll. The
          negative margin plus the matching padding puts the scrollbar against
          the panel's edge rather than inset from it.
        */}
        <div className="-mx-6 flex flex-1 flex-col gap-5 overflow-y-auto px-6">
          <AuditMetaGrid row={row} />

          <Tabs defaultValue="changes">
            <TabsList variant="line" className="mb-3">
              <TabsTrigger value="changes">Changes</TabsTrigger>
              <TabsTrigger value="diff">Diff</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="changes">
              <AuditChangesSection row={row} />
            </TabsContent>

            <TabsContent value="diff">
              <AuditJsonDiff before={entry.before} after={entry.after} />
            </TabsContent>

            <TabsContent value="raw">
              <AuditRawSection row={row} maxHeight="max-h-72" columns={1} />
            </TabsContent>
          </Tabs>
        </div>
      </SidePanelContent>
    </SidePanel>
  );
}
