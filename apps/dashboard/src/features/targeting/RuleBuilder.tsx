/**
 * The rule builder: AND-groups, an operator between them, and a plain-English
 * statement of what the whole thing means.
 *
 * Replaces a JSON textarea, and the point is not that JSON is ugly - it is that
 * a JSON textarea makes correctness the user's problem. `{"operator":"in"}` with
 * a `value` instead of `values` parses, validates as JSON, and fails a schema
 * check with a message like `0.values: Required`. This form cannot express that
 * state at all.
 *
 * Deliberately NOT drag-reorderable, though the reference design has handles.
 * Conditions inside a group are ANDed and groups are combined by one operator, so
 * order carries no meaning whatsoever - `matchesSegment` short-circuits but the
 * answer never changes. A handle that reorders something with no order is a
 * gesture that teaches the wrong model, and it would cost a dnd dependency the
 * dashboard does not currently have.
 *
 * ## The generality on offer
 *
 * Groups combined by one operator is disjunctive (or conjunctive) normal form,
 * which can express any boolean combination of conditions. Arbitrary nesting
 * would add depth without adding reachable meanings, so the builder stays two
 * levels deep and the engine's wire format stays flat enough to evaluate without
 * recursion.
 */
import type { ProjectAttribute } from '@/api/client';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/ui/segmented-control';
import { cn } from '@/ui/cn';
import { AlertTriangleIcon, PlusIcon, TrashIcon } from '@/ui/icons';
import type { SegmentMatch } from '@toggleflow/engine';

import { ConditionRow } from './ConditionRow';
import {
  emptyCondition,
  emptyRuleSet,
  type ConditionDraft,
  type DraftError,
  type RuleSetDraft,
} from './condition-draft';

const MATCH_OPTIONS = [
  { value: 'all', label: 'ALL must match (AND)' },
  { value: 'any', label: 'ANY can match (OR)' },
];

export function RuleBuilder({
  sets,
  match,
  attributes,
  errors,
  disabled,
  onSetsChange,
  onMatchChange,
}: {
  sets: RuleSetDraft[];
  match: SegmentMatch;
  attributes: ProjectAttribute[];
  errors: Record<string, DraftError>;
  disabled?: boolean;
  onSetsChange: (sets: RuleSetDraft[]) => void;
  onMatchChange: (match: SegmentMatch) => void;
}) {
  const multiSet = sets.length > 1;

  const updateSet = (setId: string, update: (set: RuleSetDraft) => RuleSetDraft) =>
    onSetsChange(sets.map((set) => (set.id === setId ? update(set) : set)));

  const updateCondition = (setId: string, next: ConditionDraft) =>
    updateSet(setId, (set) => ({
      ...set,
      conditions: set.conditions.map((c) => (c.id === next.id ? next : c)),
    }));

  const addCondition = (setId: string) =>
    updateSet(setId, (set) => ({ ...set, conditions: [...set.conditions, emptyCondition()] }));

  const removeCondition = (setId: string, conditionId: string) =>
    updateSet(setId, (set) => ({
      ...set,
      conditions: set.conditions.filter((c) => c.id !== conditionId),
    }));

  const removeSet = (setId: string) => onSetsChange(sets.filter((set) => set.id !== setId));

  /*
   * Every row empty means the segment constrains nothing, and a segment that
   * matches everyone is almost never what someone building one wants - it hands
   * the gated feature to the whole user base. Warned about rather than blocked,
   * because "everyone" is occasionally the point (a staged rollout starting from
   * a segment) and a form that refuses to save cannot say so.
   */
  const totalFilled = sets.reduce(
    (n, set) => n + set.conditions.filter((c) => c.attribute.trim() !== '').length,
    0,
  );

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-text m-0 text-[15px] font-semibold">Rule builder</h2>
          <p className="text-muted-foreground m-0 mt-0.5 text-[12.5px]">
            {describeMatch(match, sets.length)}
          </p>
        </div>
        {/*
          Hidden while there is one group, because with a single group AND and OR
          mean exactly the same thing - `[g].every(f)` and `[g].some(f)` are both
          `f(g)`. Offering a choice that changes nothing invites someone to hunt
          for the difference. It appears with the second group, which is the
          moment it starts to matter.
        */}
        {multiSet && (
          <SegmentedControl
            aria-label="How rule sets combine"
            value={match}
            options={MATCH_OPTIONS}
            disabled={disabled}
            onValueChange={(next) => onMatchChange(next as SegmentMatch)}
          />
        )}
      </header>

      {totalFilled === 0 && (
        <p className="border-rollout/40 bg-rollout-soft text-text m-0 flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px]">
          <AlertTriangleIcon size={14} className="mt-0.5 shrink-0" />
          <span>
            This segment has no conditions, so it matches <strong>every user</strong>. Add a
            condition to narrow it.
          </span>
        </p>
      )}

      {sets.map((set, index) => (
        <div key={set.id} className="flex flex-col gap-2">
          {index > 0 && <MatchDivider match={match} />}

          <div className="border-border bg-bg2 flex flex-col gap-2 rounded-lg border p-3">
            {multiSet && (
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-text m-0 text-[12.5px] font-semibold">
                  Rule set {index + 1}
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    — all of these must match
                  </span>
                </h3>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove rule set ${index + 1}`}
                  className="text-muted-foreground hover:text-destructive flex items-center gap-1 border-0 bg-transparent p-0 text-[12px]"
                  onClick={() => removeSet(set.id)}
                >
                  <TrashIcon size={12} /> Remove set
                </button>
              </div>
            )}

            {set.conditions.map((draft) => (
              <ConditionRow
                key={draft.id}
                draft={draft}
                attributes={attributes}
                error={errors[draft.id]}
                disabled={disabled}
                /*
                 * The last row of the last group stays put. Removing it would
                 * leave nothing to type into and no button to bring a row back,
                 * so the form would be stuck; clearing the fields is the way to
                 * empty a segment, and it is reversible.
                 */
                canRemove={set.conditions.length > 1 || sets.length > 1}
                onChange={(next) => updateCondition(set.id, next)}
                onRemove={() => removeCondition(set.id, draft.id)}
              />
            ))}

            <button
              type="button"
              disabled={disabled}
              className={cn(
                'border-border text-muted-foreground hover:border-primary hover:text-primary',
                'flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed bg-transparent py-2 text-[12.5px]',
              )}
              onClick={() => addCondition(set.id)}
            >
              <PlusIcon size={13} /> Add condition
            </button>
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            /*
             * Adding a second group switches to OR at the same time. AND across
             * groups is expressible but pointless - it flattens to one group - so
             * the reason anyone reaches for a second set is OR, and making them
             * then find the toggle is a step for nothing. They can still switch
             * back; the control appears with this group.
             */
            if (sets.length === 1) onMatchChange('any');
            onSetsChange([...sets, emptyRuleSet()]);
          }}
        >
          <PlusIcon size={13} /> Add rule set (OR)
        </Button>
      </div>
    </section>
  );
}

/** The AND/OR pill between two groups, mirroring the operator in force. */
function MatchDivider({ match }: { match: SegmentMatch }) {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="bg-border h-px flex-1" />
      <span className="border-border bg-panel text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-semibold">
        {match === 'any' ? 'OR' : 'AND'}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

/**
 * The rule in a sentence, above the form that builds it.
 *
 * Present because the controls alone do not say what they add up to: two groups
 * and a segmented control leave "so who does this match?" as an inference. This
 * states it, and it is the line that changes when the toggle moves.
 */
function describeMatch(match: SegmentMatch, setCount: number): string {
  if (setCount <= 1) return 'A user is in this segment when every condition below matches.';
  return match === 'any'
    ? 'A user is in this segment when ANY ONE rule set matches in full.'
    : 'A user is in this segment when EVERY rule set matches.';
}
