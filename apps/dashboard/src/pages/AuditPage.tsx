import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api, type AuditEntry, type Member } from '../api/client';
import { ErrorNote } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';

export function AuditPage() {
  const ws = useWorkspace();
  const [before, setBefore] = useState<string | null>(null);
  const [pages, setPages] = useState<AuditEntry[][]>([]);

  const auditQuery = useQuery({
    queryKey: ['audit', ws.orgId, before],
    queryFn: async () => {
      const cursor = before ? `&before=${encodeURIComponent(before)}` : '';
      const res = await api.get<{ entries: AuditEntry[] }>(
        `/v1/orgs/${ws.orgId}/audit?limit=50${cursor}`,
      );
      return res.entries;
    },
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

  const entries = [...pages.flat(), ...(auditQuery.data ?? [])];
  const last = auditQuery.data?.at(-1);

  return (
    <>
      <div className="page-head">
        <h2>Audit log</h2>
        <span className="muted">every change in this org, newest first</span>
      </div>
      <ErrorNote error={auditQuery.error} />
      <table className="data">
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="muted">{new Date(entry.createdAt).toLocaleString()}</td>
              <td>{actorName(entry.actorId)}</td>
              <td className="mono">{entry.action}</td>
              <td
                className="mono muted"
                style={{
                  maxWidth: 480,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.before || entry.after
                  ? JSON.stringify({
                      before: entry.before ?? undefined,
                      after: entry.after ?? undefined,
                    })
                  : entry.entityType}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Nothing yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {last && (auditQuery.data?.length ?? 0) === 50 && (
        <button
          type="button"
          style={{ marginTop: 12 }}
          onClick={() => {
            setPages([...pages, auditQuery.data ?? []]);
            setBefore(last.createdAt);
          }}
        >
          Load older
        </button>
      )}
    </>
  );
}
