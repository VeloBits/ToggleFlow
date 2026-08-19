/**
 * Reading a segment at a glance.
 *
 * The page this replaced put `JSON.stringify(segment.rules)` in a table column,
 * which meant that even READING a segment required parsing JSON in your head.
 * These functions are the other half of the JSON-textarea fix: the builder stopped
 * people writing it, and this stops them having to read it.
 */
import type { Condition, SegmentMatch } from '@toggleflow/engine';

import { OPERATORS, formatLiteral } from '@/features/targeting/operators';

/** `plan is one of pro, team` - one condition in the builder's own words. */
export function conditionText(condition: Condition): string {
  const operator = OPERATORS[condition.operator].label;
  if (condition.operator === 'exists') return `${condition.attribute} ${operator}`;
  if (condition.operator === 'in' || condition.operator === 'notIn') {
    return `${condition.attribute} ${operator} ${condition.values.map(formatLiteral).join(', ')}`;
  }
  return `${condition.attribute} ${operator} ${formatLiteral(condition.value)}`;
}

/**
 * The whole segment in one line, for a table cell.
 *
 * Truncated by CONDITION rather than by character, because half a condition
 * (`plan is one of pro, te…`) reads as a value that ends in "te" - a summary that
 * misleads is worse than one that is short. The remainder is reported as a count
 * so the line never claims to be complete when it is not.
 */
export function rulesSummary(
  rules: Condition[][],
  match: SegmentMatch,
  limit = 2,
): { text: string; hiddenCount: number } {
  const groups = rules.filter((group) => group.length > 0);
  if (groups.length === 0) return { text: 'Everyone', hiddenCount: 0 };

  const joiner = match === 'any' ? ' OR ' : ' AND ';

  if (groups.length === 1) {
    const shown = groups[0]!.slice(0, limit).map(conditionText);
    return { text: shown.join(' AND '), hiddenCount: groups[0]!.length - shown.length };
  }

  /*
   * With several groups the useful summary is the SHAPE, not the conditions - a
   * cell wide enough for two groups spelled out in full is a cell too wide for a
   * table. Each group collapses to its first condition plus a count.
   */
  const shown = groups.slice(0, limit).map((group) => {
    const head = conditionText(group[0]!);
    return group.length > 1 ? `(${head} +${group.length - 1})` : `(${head})`;
  });
  return { text: shown.join(joiner), hiddenCount: groups.length - shown.length };
}

/** How many conditions the segment holds in total, across every group. */
export const conditionCount = (rules: Condition[][]): number =>
  rules.reduce((n, group) => n + group.length, 0);

/** `2 rule sets (OR)` / `3 conditions` - the structural label beside the summary. */
export function structureLabel(rules: Condition[][], match: SegmentMatch): string {
  const groups = rules.filter((group) => group.length > 0);
  if (groups.length === 0) return 'No conditions';
  if (groups.length === 1) {
    const n = groups[0]!.length;
    return n === 1 ? '1 condition' : `${n} conditions`;
  }
  return `${groups.length} rule sets (${match === 'any' ? 'OR' : 'AND'})`;
}
