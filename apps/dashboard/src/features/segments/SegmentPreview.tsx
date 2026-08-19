/**
 * "Would this user be in the segment?" - the real engine, in the browser, against
 * the rules currently on screen.
 *
 * This is what replaced the reference design's member count. A segment has no
 * members to count: it is a rule evaluated per request at the edge against a
 * context the caller supplies, and nothing anywhere records who matched. A number
 * there would have to be invented. The honest answer to "who does this affect" is
 * to let someone ask about a specific user and show the reasoning, which is also
 * the answer that catches the mistake a count never would - a rule comparing the
 * number 5 against the string "5".
 *
 * `matchesSegment` and `matchesCondition` are imported from `@toggleflow/engine`,
 * the same package the edge worker and the SDKs run. The verdict here is not a
 * simulation of evaluation, it IS evaluation - so it cannot drift from production
 * behaviour, and the per-row ticks explain the verdict rather than guessing at it.
 *
 * It evaluates the UNSAVED draft, deliberately: the question worth answering is
 * "will the rule I am about to save do what I mean", and asking it before writing
 * is the whole value.
 */
import { useMemo, useState } from 'react';

import {
  matchesCondition,
  matchesSegment,
  type AttributeValue,
  type Condition,
} from '@toggleflow/engine';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/page';
import { cn } from '@/ui/cn';
import { CircleCheckIcon, CircleSlashIcon, PlusIcon, XIcon } from '@/ui/icons';
import { coerceLiteral, formatLiteral, OPERATORS } from '@/features/targeting/operators';
import type { SegmentMatch } from '@toggleflow/engine';

interface AttributeEntry {
  id: string;
  name: string;
  value: string;
}

let seq = 0;
const entry = (name = '', value = ''): AttributeEntry => ({ id: `p${++seq}`, name, value });

/**
 * Seeds the form with the attributes the rules actually mention, so the first
 * thing someone sees is the shape of the context this segment cares about rather
 * than an empty box they have to guess into. Values stay blank - those are the
 * question.
 */
function seedFrom(rules: Condition[][]): AttributeEntry[] {
  const names = [...new Set(rules.flat().map((c) => c.attribute))];
  return names.length > 0 ? names.map((name) => entry(name)) : [entry()];
}

export function SegmentPreview({ rules, match }: { rules: Condition[][]; match: SegmentMatch }) {
  /*
   * Seeded once from the rules present on mount, then owned by the user. Re-seeding
   * as they type would overwrite values mid-edit - the attribute list changes on
   * every keystroke in the builder's attribute field.
   */
  const [entries, setEntries] = useState<AttributeEntry[]>(() => seedFrom(rules));

  const attributes = useMemo(() => {
    const out: Record<string, AttributeValue> = {};
    for (const item of entries) {
      const name = item.name.trim();
      // A blank value still counts as "attribute absent", which is a distinct and
      // testable case: it is how you check that a rule does not fire on missing
      // data. Only an unnamed row is skipped.
      if (name === '' || item.value.trim() === '') continue;
      out[name] = coerceLiteral(item.value.trim());
    }
    return out;
  }, [entries]);

  const groups = useMemo(() => rules.filter((group) => group.length > 0), [rules]);

  /*
   * Built in the wire shape and handed to the engine, rather than reimplementing
   * the group logic here. `conditions` is only read when `ruleSets` is empty, so a
   * single group goes in as `conditions` and several go in as `ruleSets` - the
   * same split `buildSegmentEntry` makes server-side.
   */
  const verdict = useMemo(() => {
    if (groups.length === 0) return null;
    const segment =
      groups.length === 1
        ? { conditions: groups[0]!, match, ruleSets: [] }
        : { conditions: [], match, ruleSets: groups.map((conditions) => ({ conditions })) };
    return matchesSegment(segment, attributes);
  }, [groups, match, attributes]);

  const update = (id: string, patch: Partial<AttributeEntry>) =>
    setEntries((current) => current.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <Panel title="Test this segment">
      <div className="flex flex-col gap-2 p-3">
        <p className="text-muted-foreground m-0 text-[12px]">
          Enter a user’s attributes to see whether they fall in this segment.
        </p>

        {entries.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5">
            <Input
              value={item.name}
              placeholder="attribute"
              aria-label="Attribute name"
              className="min-w-0 flex-1 font-mono text-[12px]"
              onChange={(event) => update(item.id, { name: event.target.value })}
            />
            <Input
              value={item.value}
              placeholder="value"
              aria-label={item.name.trim() ? `Value for ${item.name.trim()}` : 'Attribute value'}
              className="min-w-0 flex-1 font-mono text-[12px]"
              onChange={(event) => update(item.id, { value: event.target.value })}
            />
            <button
              type="button"
              aria-label={item.name.trim() ? `Remove ${item.name.trim()}` : 'Remove attribute'}
              className="text-muted-foreground hover:text-destructive flex h-8 w-7 items-center justify-center border-0 bg-transparent p-0"
              onClick={() => setEntries((current) => current.filter((e) => e.id !== item.id))}
            >
              <XIcon size={12} />
            </button>
          </div>
        ))}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEntries((current) => [...current, entry()])}
          >
            <PlusIcon size={12} /> Add attribute
          </Button>
        </div>

        {verdict === null ? (
          <p className="text-muted-foreground m-0 border-t border-dashed pt-2.5 text-[12px]">
            Add a condition to the rule builder to test against.
          </p>
        ) : (
          <div className="border-border flex flex-col gap-2 border-t pt-2.5">
            <p
              className={cn(
                'm-0 flex items-center gap-1.5 text-[13px] font-semibold',
                verdict ? 'text-on' : 'text-muted-foreground',
              )}
            >
              {verdict ? <CircleCheckIcon size={14} /> : <CircleSlashIcon size={14} />}
              {verdict ? 'In this segment' : 'Not in this segment'}
            </p>

            {/*
              Per-condition ticks, so a false verdict says WHICH condition failed.
              Under OR the group headings matter too: one fully-ticked group is
              enough, and seeing that is how someone learns the operator.
            */}
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {groups.map((group, index) => (
                <li key={index} className="flex flex-col gap-0.5">
                  {groups.length > 1 && (
                    <span className="text-muted-foreground text-[11px] font-semibold">
                      Rule set {index + 1}
                      {group.every((c) => matchesCondition(c, attributes)) ? ' — matches' : ''}
                    </span>
                  )}
                  {group.map((condition, conditionIndex) => (
                    <ConditionResult
                      key={conditionIndex}
                      condition={condition}
                      passed={matchesCondition(condition, attributes)}
                    />
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ConditionResult({ condition, passed }: { condition: Condition; passed: boolean }) {
  return (
    <span className="flex items-start gap-1.5 text-[12px]">
      {passed ? (
        <CircleCheckIcon size={12} className="text-on mt-0.5 shrink-0" />
      ) : (
        <CircleSlashIcon size={12} className="text-muted-foreground mt-0.5 shrink-0" />
      )}
      <span className={cn('min-w-0', passed ? 'text-text' : 'text-muted-foreground')}>
        {describeCondition(condition)}
      </span>
    </span>
  );
}

/** One condition in the same words the builder used to create it. */
export function describeCondition(condition: Condition): string {
  const operator = OPERATORS[condition.operator].label;
  if (condition.operator === 'exists') return `${condition.attribute} ${operator}`;
  if (condition.operator === 'in' || condition.operator === 'notIn') {
    return `${condition.attribute} ${operator} ${condition.values.map(formatLiteral).join(', ')}`;
  }
  return `${condition.attribute} ${operator} ${formatLiteral(condition.value)}`;
}
