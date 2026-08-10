/**
 * The landing screen for a signed-in user.
 *
 * It answers three questions and no others: what is the state of this
 * environment, what needs attention, and what just changed. No vanity charts -
 * there is no evaluation pipeline yet, so anything resembling a usage graph
 * would be invented (TOGGLEFLOW_UX_DESIGN §4.1).
 *
 * All of it is assembled from endpoints that already exist, so this page adds
 * no API surface.
 */
import { useQuery } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';

import { actorLabel, auditRecentQueryOptions, membersQueryOptions } from '../api/audit';
import { flagsQueryOptions } from '../api/flags';
import { environmentTone } from '../components/nav/environment-tone';
import { EmptyState, PageHeader, Panel } from '../components/page';
import { ErrorNote } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { cn } from '../ui/cn';
import {
  CircleCheckIcon,
  CircleHalfIcon,
  CircleSlashIcon,
  FlagIcon,
  FolderIcon,
  type IconProps,
} from '@velobits-dev/icons';
import { Button, Card, StatusChip } from '@velobits-dev/ui';
import { relativeTime } from '../ui/relative-time';

/**
 * A count and what it counts, on the design system's `Card`.
 *
 * `surface="panel"` rather than the glass default: four of these sit in a row
 * inside the authenticated shell, directly above two more panels, and the glass
 * tier is for surfaces that float over content.
 *
 * `icon` deliberately stays a component TYPE here, unlike `EmptyState`'s: the
 * tile owns the glyph's size, and the only thing a caller varies is its tone.
 *
 * The DOM shape — one box, one text block, value `<p>` before label `<p>` — is a
 * contract with `test/home-page.test.tsx`, which reads a tile's number by walking
 * up from its label. Keep the two paragraphs siblings.
 */
function Stat({
  icon: Icon,
  value,
  label,
  className,
}: {
  icon: ComponentType<IconProps>;
  value: number | string;
  label: string;
  className?: string;
}) {
  return (
    <Card surface="panel" className="flex-row items-center gap-3 px-4 py-3">
      <Icon size={18} className={cn('shrink-0', className ?? 'text-muted-foreground')} />
      <div className="min-w-0">
        <p className="text-fg m-0 text-[18px] leading-none font-bold">{value}</p>
        <p className="text-muted-foreground m-0 mt-1 text-[12px]">{label}</p>
      </div>
    </Card>
  );
}

/**
 * A panel header's "go to the full list" link.
 *
 * `Button variant="link"` for the paint, stripped of the control box: this sits
 * in a 13px header row, not on the button grid. It is the system's link colour
 * (`--primary-text`), which is the one blue that clears AA as text.
 */
function PanelLink({ to, children }: { to: string; children: string }) {
  return (
    <Button variant="link" size="sm" asChild className="h-auto px-0 text-[12.5px]">
      <Link to={to}>{children}</Link>
    </Button>
  );
}

/** A flag key, wherever one is a link. Monospaced, and the system's link blue. */
const KEY_LINK = 'text-link font-mono hover:underline';

export function HomePage() {
  const ws = useWorkspace();

  const flagsQuery = useQuery(flagsQueryOptions(ws.environmentId));
  const auditQuery = useQuery(auditRecentQueryOptions(ws.orgId));
  const membersQuery = useQuery(membersQueryOptions(ws.orgId));

  const actorName = (actorId: string | null) => actorLabel(actorId, membersQuery.data);

  const live = (flagsQuery.data ?? []).filter((flag) => !flag.archived);
  const rollingOut = live.filter((flag) => flag.enabled && flag.rolloutPercent !== null);
  const on = live.filter((flag) => flag.enabled && flag.rolloutPercent === null);
  const off = live.filter((flag) => !flag.enabled);
  const tone = ws.environment ? environmentTone(ws.environment.key) : null;

  if (ws.ready && ws.projects.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${ws.me?.user.displayName ?? 'there'}`} />
        <Panel>
          <EmptyState
            icon={<FolderIcon />}
            title="Create your first project"
            description={
              ws.role === 'admin'
                ? 'A project holds your flags and its own environments. Create one from the top bar — it starts with Production, and you can add more environments whenever you need them.'
                : 'No projects exist in this organization yet. An admin needs to create the first one.'
            }
          />
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={ws.project?.name ?? 'Overview'}
        description={
          ws.environment ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn('size-2 rounded-full', tone?.dot)} />
              Showing <strong className="text-fg font-medium">{ws.environment.name}</strong>
              <span className="font-mono">({ws.environment.key})</span>
            </span>
          ) : (
            'No environment selected.'
          )
        }
      />

      <ErrorNote error={flagsQuery.error} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FlagIcon} value={live.length} label="flags in this environment" />
        <Stat icon={CircleCheckIcon} value={on.length} label="fully on" className="text-success" />
        <Stat
          icon={CircleHalfIcon}
          value={rollingOut.length}
          label="rolling out"
          className="text-warning"
        />
        <Stat icon={CircleSlashIcon} value={off.length} label="off" className="text-danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Rolling out" actions={<PanelLink to="/flags">All flags →</PanelLink>}>
          {rollingOut.length === 0 ? (
            <EmptyState
              title="Nothing mid-rollout"
              description="Flags on a percentage rollout in this environment show up here."
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {rollingOut.slice(0, 6).map((flag) => (
                <li
                  key={flag.id}
                  className="border-border flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                >
                  <Link
                    to={`/flags/${flag.id}`}
                    className={cn(KEY_LINK, 'min-w-0 flex-1 truncate')}
                  >
                    {flag.key}
                  </Link>
                  <StatusChip status="partial">{flag.rolloutPercent}%</StatusChip>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" actions={<PanelLink to="/audit">Audit log →</PanelLink>}>
          {(auditQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Every change in this organization is recorded here as it happens."
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {(auditQuery.data ?? []).slice(0, 6).map((entry) => (
                <li
                  key={entry.id}
                  className="border-border flex items-baseline gap-3 border-b px-4 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                    {entry.action}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[12px]">
                    {actorName(entry.actorId)} · {relativeTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
