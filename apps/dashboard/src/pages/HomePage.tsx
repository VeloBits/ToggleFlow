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

import { api, type AuditEntry, type Member } from '../api/client';
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
} from '../ui/icons';
import { relativeTime } from '../ui/relative-time';

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
    <div className="border-border bg-panel flex items-center gap-3 rounded-lg border px-4 py-3">
      <Icon size={18} className={cn('shrink-0', className ?? 'text-muted-foreground')} />
      <div className="min-w-0">
        <p className="text-text m-0 text-[18px] leading-none font-bold">{value}</p>
        <p className="text-muted-foreground m-0 mt-1 text-[12px]">{label}</p>
      </div>
    </div>
  );
}

export function HomePage() {
  const ws = useWorkspace();

  const flagsQuery = useQuery(flagsQueryOptions(ws.environmentId));
  const auditQuery = useQuery({
    queryKey: ['audit', ws.orgId, 'home'],
    queryFn: () =>
      api
        .get<{ entries: AuditEntry[] }>(`/v1/orgs/${ws.orgId}/audit?limit=8`)
        .then((res) => res.entries),
    enabled: ws.orgId !== null,
  });
  const membersQuery = useQuery({
    queryKey: ['members', ws.orgId],
    queryFn: () => api.get<Member[]>(`/v1/orgs/${ws.orgId}/members`),
    enabled: ws.orgId !== null,
  });

  const actorName = (actorId: string | null) => {
    if (!actorId) return 'system';
    const member = membersQuery.data?.find((m) => m.userId === actorId);
    return member?.displayName ?? member?.email ?? actorId.slice(0, 8);
  };

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
            icon={FolderIcon}
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
              Showing <strong className="text-text font-medium">{ws.environment.name}</strong>
              <span className="mono">({ws.environment.key})</span>
            </span>
          ) : (
            'No environment selected.'
          )
        }
      />

      <ErrorNote error={flagsQuery.error} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FlagIcon} value={live.length} label="flags in this environment" />
        <Stat icon={CircleCheckIcon} value={on.length} label="fully on" className="text-on" />
        <Stat
          icon={CircleHalfIcon}
          value={rollingOut.length}
          label="rolling out"
          className="text-rollout"
        />
        <Stat icon={CircleSlashIcon} value={off.length} label="off" className="text-off" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Rolling out"
          actions={
            <Link to="/flags" className="text-[12.5px]">
              All flags →
            </Link>
          }
        >
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
                  <Link to={`/flags/${flag.id}`} className="mono min-w-0 flex-1 truncate">
                    {flag.key}
                  </Link>
                  <span className="chip chip-rollout shrink-0">{flag.rolloutPercent}%</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent activity"
          actions={
            <Link to="/audit" className="text-[12.5px]">
              Audit log →
            </Link>
          }
        >
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
                  <span className="mono min-w-0 flex-1 truncate text-[12.5px]">{entry.action}</span>
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
