/**
 * Which flags target this segment, and in which environments.
 *
 * The reference design gave this a tab AND a column; both are here, reading the
 * same project-wide usage response (see `api/segments.ts` for why one request
 * serves both). Grouped by flag rather than listed flat, because "flag X, in dev
 * and prod" is one fact and two rows of it reads as two.
 *
 * This is also the delete guard's evidence: the Settings tab refuses a quiet
 * delete while this list is non-empty, and links here instead.
 */
import { Link } from 'react-router-dom';

import type { SegmentUsage } from '@/api/client';
import { EmptyState } from '@/components/page';
import { environmentTone } from '@/components/nav/environment-tone';
import { cn } from '@/ui/cn';
import { FlagIcon } from '@/ui/icons';

export function SegmentUsagePanel({
  usage,
  loading,
}: {
  usage: SegmentUsage | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-muted-foreground m-0 p-4 text-[12.5px]">Loading references…</p>;
  }

  const references = usage?.references ?? [];
  if (references.length === 0) {
    return (
      <EmptyState
        icon={FlagIcon}
        title="Not used by any flag"
        description="Add this segment to a flag's targeting rules and it will appear here."
      />
    );
  }

  /* One entry per flag, carrying the environments it is targeted in. */
  const byFlag = new Map<string, { key: string; name: string; environments: typeof references }>();
  for (const reference of references) {
    const entry = byFlag.get(reference.flagId) ?? {
      key: reference.flagKey,
      name: reference.flagName,
      environments: [],
    };
    entry.environments.push(reference);
    byFlag.set(reference.flagId, entry);
  }

  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {[...byFlag.entries()].map(([flagId, flag]) => (
        <li key={flagId} className="border-border border-b px-4 py-3 last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/flags/${flagId}`}
                className="text-text hover:text-primary text-[13px] font-medium underline-offset-2 hover:underline"
              >
                {flag.name}
              </Link>
              <span className="text-muted-foreground block truncate font-mono text-[11.5px]">
                {flag.key}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {flag.environments.map((environment) => (
                <span
                  key={environment.environmentId}
                  className={cn(
                    'rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
                    // Same colour vocabulary as the topbar and the flag header, so
                    // "prod" reads as prod everywhere it appears.
                    environmentTone(environment.environmentKey).chip,
                  )}
                >
                  {environment.environmentName}
                </span>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
