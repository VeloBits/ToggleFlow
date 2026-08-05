/**
 * Search and filters for the log.
 *
 * Same shape as `FlagsToolbar` - a search field plus a Popover carrying a count
 * badge - because the two screens should not teach two different filtering
 * idioms. A Popover and never a DropdownMenu: Radix menus cannot host a text
 * input, and this panel may grow one.
 *
 * The scope of these filters is narrower than it looks and the footer says so:
 * they narrow the entries already loaded, because the endpoint takes no filter
 * parameters. See the docblock in `audit-filter.ts`.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FilterIcon, SearchIcon, XIcon } from '@/ui/icons';

import { ACTION_GROUPS } from './audit-events';
import { EMPTY_FILTER, activeAuditFilterCount, type AuditFilter } from './audit-filter';

export function AuditToolbar({
  filter,
  onChange,
  actors,
  disabled = false,
}: {
  filter: AuditFilter;
  onChange: (filter: AuditFilter) => void;
  /** The actors present in the loaded entries, so the select never offers an empty result. */
  actors: Array<{ id: string; label: string }>;
  disabled?: boolean;
}) {
  const active = activeAuditFilterCount(filter);
  const set = <K extends keyof AuditFilter>(field: K, value: AuditFilter[K]) =>
    onChange({ ...filter, [field]: value });

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <SearchIcon
          size={15}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <Input
          type="search"
          value={filter.search}
          disabled={disabled}
          placeholder="Search action, target, person or payload…"
          aria-label="Search the audit log"
          className="pl-8"
          onChange={(event) => set('search', event.target.value)}
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" disabled={disabled} className="gap-1.5">
            <FilterIcon size={14} />
            Filters
            {active > 0 && (
              <span className="bg-primary text-primary-foreground rounded-pill ml-0.5 px-1.5 text-[11px] font-semibold tabular-nums">
                {active}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-filter-group">Area</Label>
              <NativeSelect
                id="audit-filter-group"
                value={filter.group}
                onChange={(event) => set('group', event.target.value)}
              >
                <option value="all">Everything</option>
                {ACTION_GROUPS.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-filter-actor">Changed by</Label>
              <NativeSelect
                id="audit-filter-actor"
                value={filter.actor}
                // Disabled rather than hidden when there is nobody to pick, for
                // the same reason as the flags toolbar: a control that comes and
                // goes teaches nothing.
                disabled={actors.length === 0}
                onChange={(event) => set('actor', event.target.value)}
              >
                <option value="all">Anyone</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {active > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => onChange({ ...EMPTY_FILTER, search: filter.search })}
              >
                <XIcon size={13} /> Clear filters
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
