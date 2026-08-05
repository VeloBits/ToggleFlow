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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SidePanel } from '@/ui/side-panel';
import { relativeTime } from '@/ui/relative-time';

import { AuditActionBadge } from './AuditActionBadge';
import { AuditChangesSection, AuditMetaGrid, AuditRawSection } from './AuditEventDetail';
import { AuditJsonDiff } from './AuditJsonDiff';
import type { AuditRow } from './audit-summary';

export function AuditDetailPanel({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  const { entry, summary } = row;

  return (
    <SidePanel
      title={
        <span className="flex flex-wrap items-center gap-2">
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
        </span>
      }
      description={
        <>
          {row.actor} ·{' '}
          <span title={new Date(entry.createdAt).toLocaleString()}>
            {relativeTime(entry.createdAt)}
          </span>
        </>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
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
    </SidePanel>
  );
}
