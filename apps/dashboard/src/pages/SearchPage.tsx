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

import { api, type Segment } from '../api/client';
import { flagDefinitionsQueryOptions, flagsQueryOptions } from '../api/flags';
import { EmptyState, PageHeader, Panel } from '../components/page';
import { ErrorNote, StatusChip } from '../components/ui';
import { useWorkspace } from '../state/WorkspaceContext';
import { cn } from '../ui/cn';
import { SearchIcon } from '@velobits-dev/icons';
import { Badge, Input } from '@velobits-dev/ui';

/** A key, wherever one is a link. Monospaced, and the system's link blue. */
const KEY_LINK = 'text-link font-mono hover:underline';

export function SearchPage() {
  const ws = useWorkspace();
  const [query, setQuery] = useState('');

  const flagsQuery = useQuery(flagsQueryOptions(ws.environmentId));
  const definitionsQuery = useQuery(flagDefinitionsQueryOptions(ws.projectId));
  const segmentsQuery = useQuery({
    queryKey: ['segments', ws.projectId],
    queryFn: () => api.get<Segment[]>(`/v1/projects/${ws.projectId}/segments`),
    enabled: ws.projectId !== null,
  });

  const needle = query.trim().toLowerCase();

  const flagMatches = useMemo(() => {
    if (!needle) return [];
    const tagsByFlag = new Map((definitionsQuery.data ?? []).map((d) => [d.id, d.tags]));
    return (flagsQuery.data ?? [])
      .map((flag) => ({ ...flag, tags: tagsByFlag.get(flag.id) ?? [] }))
      .filter(
        (flag) =>
          flag.key.toLowerCase().includes(needle) ||
          flag.name.toLowerCase().includes(needle) ||
          flag.tags.some((tag) => tag.toLowerCase().includes(needle)),
      );
  }, [needle, flagsQuery.data, definitionsQuery.data]);

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

      {/*
        The leading glyph is absolutely positioned over the field rather than
        wrapped beside it: `Input` is one `<input>` with no adornment slot (by
        design — an adornment API would have to reserve space it cannot measure),
        so the icon sits in a `relative` box and the field pays for it with
        `pl-9`. `pointer-events-none` keeps the whole box clickable as the field.
        Same treatment as the flags toolbar, so the two searches match.
      */}
      <div className="relative mb-4 max-w-xl">
        <SearchIcon
          size={16}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
        />
        <Input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by key, name, tag or description…"
          aria-label="Search flags and segments"
          className="h-10 pl-9"
        />
      </div>

      <ErrorNote error={flagsQuery.error ?? segmentsQuery.error} />

      {!needle ? (
        <Panel>
          <EmptyState
            icon={<SearchIcon />}
            title="Start typing"
            description="Matches appear as you type. Flag keys, names and tags are searched, along with segment keys, names and descriptions."
          />
        </Panel>
      ) : total === 0 ? (
        <Panel>
          <EmptyState
            icon={<SearchIcon />}
            title={`Nothing matches “${query.trim()}”`}
            description="Try a shorter fragment of the key, or check that the right project and environment are selected in the top bar."
          />
        </Panel>
      ) : (
        <div className="grid gap-4">
          {flagMatches.length > 0 && (
            <Panel title={`Flags · ${flagMatches.length}`}>
              <ul className="m-0 list-none p-0">
                {flagMatches.map((flag) => (
                  <li
                    key={flag.id}
                    className="border-border flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0"
                  >
                    <StatusChip enabled={flag.enabled} rolloutPercent={flag.rolloutPercent} />
                    <Link to={`/flags/${flag.id}`} className={cn(KEY_LINK, 'min-w-0 truncate')}>
                      {flag.key}
                    </Link>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
                      {flag.name}
                    </span>
                    {/* A marker, not a flag state — so a Badge, never a StatusChip. */}
                    {flag.archived && <Badge variant="neutral">archived</Badge>}
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
                    <Link to="/segments" className={cn(KEY_LINK, 'min-w-0 truncate')}>
                      {segment.key}
                    </Link>
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
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
