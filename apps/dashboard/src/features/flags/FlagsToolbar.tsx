/**
 * Search, filters and the archived toggle.
 *
 * The filters live in a Popover rather than as a row of always-visible selects.
 * Two reasons: at four axes the row wraps on a laptop and pushes the table below
 * the fold, and a badge on a single "Filters" button answers "why am I seeing
 * only 12 of 254?" in one glance, which a row of selects at their default values
 * does not.
 *
 * A Popover specifically, and never a DropdownMenu: this panel contains a text
 * input, and Radix menus cannot host one - `onOpenAutoFocus` is private on menu
 * content, so a field inside one means fighting the primitive.
 */
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { FLAG_TYPES, FLAG_VALUE_TYPES } from '@toggleflow/engine';
import { FilterIcon, SearchIcon, XIcon } from '@/ui/icons';

import { EMPTY_FILTER, type FlagFilter } from './flags-filter';

/** How many axes are away from their default - the badge on the trigger. */
export function activeFilterCount(filter: FlagFilter): number {
  let count = 0;
  if (filter.tag !== EMPTY_FILTER.tag) count += 1;
  if (filter.status !== EMPTY_FILTER.status) count += 1;
  if (filter.valueType !== EMPTY_FILTER.valueType) count += 1;
  if (filter.includeArchived !== EMPTY_FILTER.includeArchived) count += 1;
  return count;
}

export function FlagsToolbar({
  filter,
  onChange,
  allTags,
  disabled = false,
}: {
  filter: FlagFilter;
  onChange: (filter: FlagFilter) => void;
  allTags: string[];
  disabled?: boolean;
}) {
  const active = activeFilterCount(filter);
  const set = <K extends keyof FlagFilter>(field: K, value: FlagFilter[K]) =>
    onChange({ ...filter, [field]: value });

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <SearchIcon
          size={15}
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <Input
          type="search"
          value={filter.search}
          disabled={disabled}
          placeholder="Search name, key or description…"
          aria-label="Search flags"
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
              <span className="bg-primary text-primary-foreground ml-0.5 rounded-pill px-1.5 text-[11px] font-semibold tabular-nums">
                {active}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-filter-status">Status</Label>
              <NativeSelect
                id="flag-filter-status"
                value={filter.status}
                onChange={(event) => set('status', event.target.value as FlagFilter['status'])}
              >
                <option value="all">All statuses</option>
                <option value="on">On</option>
                <option value="off">Off</option>
                <option value="rollout">Rolling out</option>
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-filter-type">Type</Label>
              <NativeSelect
                id="flag-filter-type"
                value={filter.valueType}
                onChange={(event) =>
                  set('valueType', event.target.value as FlagFilter['valueType'])
                }
              >
                <option value="all">All types</option>
                {FLAG_VALUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {FLAG_TYPES[type].label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-filter-tag">Tag</Label>
              <NativeSelect
                id="flag-filter-tag"
                value={filter.tag}
                // Disabled rather than hidden when a project has no tags: a
                // control that appears and disappears teaches nothing.
                disabled={allTags.length === 0}
                onChange={(event) => set('tag', event.target.value)}
              >
                <option value="">{allTags.length === 0 ? 'No tags yet' : 'All tags'}</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Checkbox
                id="flag-filter-archived"
                checked={filter.includeArchived}
                onCheckedChange={(checked) => set('includeArchived', checked === true)}
              />
              <Label htmlFor="flag-filter-archived" className="font-normal">
                Show archived flags
              </Label>
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
