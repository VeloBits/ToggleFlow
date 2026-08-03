/**
 * Search across the current project: flags first, then segments.
 *
 * Deliberately scoped to the selected project rather than the whole org - a
 * flag key only means something inside the project that defines it, and the
 * environment chosen in the top bar is what gives a flag its state. Searching
 * across projects would return rows whose ON/OFF column could not be filled in.
 *
 * Filtering happens client-side over the same lists the Flags and Segments
 * pages already load, so results are instant and no search endpoint is needed
 * for the sizes this product targets. A project large enough to make that
 * false wants a server-side index, not a bigger fetch.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, type FlagRow, type Segment, type Tool } from '../api/client';
import { EmptyState, PageHeader, Panel } from '../components/page';
import { ErrorNote, StatusChip } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { SearchIcon } from '../ui/icons';

export function SearchPage() {
  const ws = useWorkspace();
  const [query, setQuery] = useState('');

  const flagsQuery = useQuery({
    queryKey: ['flags', ws.environmentId],
    queryFn: () => api.get<FlagRow[]>(`/v1/environments/${ws.environmentId}/flags`),
    enabled: ws.environmentId !== null,
  });
  const toolsQuery = useQuery({
    queryKey: ['tools', ws.projectId],
    queryFn: () => api.get<Tool[]>(`/v1/projects/${ws.projectId}/tools?includeArchived=true`),
    enabled: ws.projectId !== null,
  });
  const segmentsQuery = useQuery({
    queryKey: ['segments', ws.projectId],
    queryFn: () => api.get<Segment[]>(`/v1/projects/${ws.projectId}/segments`),
    enabled: ws.projectId !== null,
  });

  const needle = query.trim().toLowerCase();

  const flagMatches = useMemo(() => {
    if (!needle) return [];
    const tagsByTool = new Map((toolsQuery.data ?? []).map((t) => [t.id, t.tags]));
    return (flagsQuery.data ?? [])
      .map((row) => ({ ...row, tags: tagsByTool.get(row.toolId) ?? [] }))
      .filter(
        (row) =>
          row.toolKey.toLowerCase().includes(needle) ||
          row.toolName.toLowerCase().includes(needle) ||
          row.tags.some((tag) => tag.toLowerCase().includes(needle)),
      );
  }, [needle, flagsQuery.data, toolsQuery.data]);

  const segmentMatches = useMemo(() => {
    if (!needle) return [];
    return (segmentsQuery.data ?? []).filter(
      (segment) =>
        segment.key.toLowerCase().includes(needle) ||
        segment.name.toLowerCase().includes(needle) ||
        (segment.description ?? '').toLowerCase().includes(needle),
    );
  }, [needle, segmentsQuery.data]);

  const total = flagMatches.length + segmentMatches.length;

  return (
    <>
      <PageHeader
        title="Search"
        description={
          ws.project
            ? `Flags and segments in ${ws.project.name}${ws.environment ? ` · ${ws.environment.name}` : ''}.`
            : 'Select a project to search.'
        }
      />

      <div className="relative mb-4 max-w-xl">
        <SearchIcon
          size={16}
          className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by key, name, tag or description…"
          aria-label="Search flags and segments"
          className="w-full py-2 pr-3 pl-9"
        />
      </div>

      <ErrorNote error={flagsQuery.error ?? segmentsQuery.error} />

      {!needle ? (
        <Panel>
          <EmptyState
            icon={SearchIcon}
            title="Start typing"
            description="Matches appear as you type. Flag keys, names and tags are searched, along with segment keys, names and descriptions."
          />
        </Panel>
      ) : total === 0 ? (
        <Panel>
          <EmptyState
            icon={SearchIcon}
            title={`Nothing matches “${query.trim()}”`}
            description="Try a shorter fragment of the key, or check that the right project and environment are selected in the top bar."
          />
        </Panel>
      ) : (
        <div className="grid gap-4">
          {flagMatches.length > 0 && (
            <Panel title={`Flags · ${flagMatches.length}`}>
              <ul className="m-0 list-none p-0">
                {flagMatches.map((row) => (
                  <li
                    key={row.toolId}
                    className="border-border flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <StatusChip enabled={row.enabled} rolloutPercent={row.rolloutPercent} />
                    <Link to={`/tools/${row.toolId}`} className="mono min-w-0 truncate">
                      {row.toolKey}
                    </Link>
                    <span className="text-muted min-w-0 flex-1 truncate text-[13px]">
                      {row.toolName}
                    </span>
                    {row.archived && <span className="tag shrink-0">archived</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {segmentMatches.length > 0 && (
            <Panel title={`Segments · ${segmentMatches.length}`}>
              <ul className="m-0 list-none p-0">
                {segmentMatches.map((segment) => (
                  <li
                    key={segment.id}
                    className="border-border flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <Link to="/segments" className="mono min-w-0 truncate">
                      {segment.key}
                    </Link>
                    <span className="text-muted min-w-0 flex-1 truncate text-[13px]">
                      {segment.name}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}
