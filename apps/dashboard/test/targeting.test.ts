/**
 * The pure half of the rule builder: literal coercion, draft→`Condition`
 * conversion, and the read-only summaries.
 *
 * Coercion gets the most attention because it is the one place a rule can look
 * right and silently never match. The engine compares with `===` against a context
 * carrying real `string | number | boolean`, so getting the TYPE wrong is
 * indistinguishable from getting the value wrong - and invisible on screen.
 */
import { describe, expect, it } from 'vitest';

import {
  convertCondition,
  convertRuleSets,
  emptyCondition,
  isBlank,
  toDraft,
  toRuleSetDrafts,
  type ConditionDraft,
} from '../src/features/targeting/condition-draft';
import { OPERATORS, arityOf, coerceLiteral } from '../src/features/targeting/operators';
import {
  conditionCount,
  conditionText,
  rulesSummary,
  structureLabel,
} from '../src/features/segments/segment-summary';

const draft = (over: Partial<ConditionDraft> = {}): ConditionDraft => ({
  ...emptyCondition(),
  attribute: 'plan',
  ...over,
});

describe('coerceLiteral', () => {
  it('coerces exact numbers, so a rule against a numeric attribute matches', () => {
    expect(coerceLiteral('5')).toBe(5);
    expect(coerceLiteral('-2')).toBe(-2);
    expect(coerceLiteral('3.5')).toBe(3.5);
    expect(coerceLiteral('0')).toBe(0);
  });

  it('coerces exact booleans only', () => {
    expect(coerceLiteral('true')).toBe(true);
    expect(coerceLiteral('false')).toBe(false);
    // A plan really called "True" must survive as text.
    expect(coerceLiteral('True')).toBe('True');
    expect(coerceLiteral('TRUE')).toBe('TRUE');
  });

  it.each([
    // THE case the round-trip rule exists for: Number('1.0') is 1, so a naive
    // coercion turns a version string into a number that never matches.
    ['1.0', '1.0'],
    ['007', '007'],
    ['1e3', '1e3'],
    ['0.50', '0.50'],
    ['+5', '+5'],
    [' 5', ' 5'],
    ['5px', '5px'],
    ['', ''],
  ])('leaves %s as text', (input, expected) => {
    expect(coerceLiteral(input)).toBe(expected);
  });

  it('never coerces something it cannot write back identically', () => {
    // The invariant, stated directly: coercion happens only when String(Number(x))
    // round-trips to x.
    for (const input of ['1.0', '007', '1e3', '0x10', 'Infinity', '  ', '- 1']) {
      const result = coerceLiteral(input);
      if (typeof result === 'number') expect(String(result)).toBe(input);
    }
  });
});

describe('operator registry', () => {
  it('describes every engine operator', () => {
    // A `Record` over the union, so this is really a check that no entry is blank.
    for (const [operator, descriptor] of Object.entries(OPERATORS)) {
      expect(descriptor.label, operator).toBeTruthy();
      expect(descriptor.arity, operator).toBeTruthy();
    }
  });

  it('maps operators to the value shape they need', () => {
    expect(arityOf('eq')).toBe('single');
    expect(arityOf('in')).toBe('multi');
    expect(arityOf('gte')).toBe('number');
    expect(arityOf('exists')).toBe('none');
  });
});

describe('convertCondition', () => {
  it('treats an untouched row as unfinished, not invalid', () => {
    const blank = emptyCondition();
    expect(isBlank(blank)).toBe(true);
    // Neither a condition nor an error: a rule being built is normal.
    expect(convertCondition(blank)).toEqual({});
  });

  it('builds a scalar condition with the coerced type', () => {
    expect(convertCondition(draft({ operator: 'eq', value: 'pro' })).condition).toEqual({
      attribute: 'plan',
      operator: 'eq',
      value: 'pro',
    });
    expect(
      convertCondition(draft({ attribute: 'seats', operator: 'eq', value: '5' })).condition,
    ).toEqual({ attribute: 'seats', operator: 'eq', value: 5 });
  });

  it('builds a list condition from chips, dropping blanks', () => {
    expect(
      convertCondition(draft({ operator: 'in', values: ['pro', '  ', 'team'] })).condition,
    ).toEqual({ attribute: 'plan', operator: 'in', values: ['pro', 'team'] });
  });

  it('builds exists with no value, whatever is left in the draft', () => {
    // The draft keeps the text so switching operators does not lose it; the
    // conversion must ignore it.
    expect(
      convertCondition(draft({ operator: 'exists', value: 'stale', values: ['stale'] })).condition,
    ).toEqual({ attribute: 'plan', operator: 'exists' });
  });

  it('requires a real number for the numeric operators', () => {
    expect(
      convertCondition(draft({ attribute: 'seats', operator: 'gte', value: '5' })).condition,
    ).toEqual({ attribute: 'seats', operator: 'gte', value: 5 });
    expect(
      convertCondition(draft({ attribute: 'seats', operator: 'gte', value: 'abc' })).error,
    ).toEqual({ kind: 'number' });
  });

  it('reports the missing half of a half-filled row', () => {
    expect(convertCondition(draft({ attribute: '', value: 'pro' })).error).toEqual({
      kind: 'attribute',
    });
    expect(convertCondition(draft({ operator: 'eq', value: '' })).error).toEqual({ kind: 'value' });
    expect(convertCondition(draft({ operator: 'in', values: [] })).error).toEqual({
      kind: 'values',
    });
  });

  it('trims the attribute', () => {
    expect(
      convertCondition(draft({ attribute: '  plan  ', value: 'pro' })).condition,
    ).toMatchObject({ attribute: 'plan' });
  });
});

describe('convertRuleSets', () => {
  it('drops blank rows and empty groups', () => {
    const { rules, errors } = convertRuleSets([
      { id: 'g1', conditions: [draft({ operator: 'eq', value: 'pro' }), emptyCondition()] },
      { id: 'g2', conditions: [emptyCondition()] },
    ]);
    // An empty group matches everyone, and under OR that silently widens the
    // segment to the whole world - so it must not survive.
    expect(rules).toEqual([[{ attribute: 'plan', operator: 'eq', value: 'pro' }]]);
    expect(errors).toEqual({});
  });

  it('collects every row error rather than stopping at the first', () => {
    const bad1 = draft({ id: 'a', attribute: 'seats', operator: 'gte', value: 'abc' });
    const bad2 = draft({ id: 'b', attribute: '', value: 'pro' });
    const { errors } = convertRuleSets([{ id: 'g1', conditions: [bad1, bad2] }]);
    // Reporting one at a time would make you submit twice to find two problems.
    expect(Object.keys(errors).sort()).toEqual(['a', 'b']);
  });

  it('keeps several groups when each has content', () => {
    const { rules } = convertRuleSets([
      { id: 'g1', conditions: [draft({ operator: 'eq', value: 'pro' })] },
      { id: 'g2', conditions: [draft({ attribute: 'country', operator: 'eq', value: 'us' })] },
    ]);
    expect(rules).toHaveLength(2);
  });
});

describe('draft round-trip', () => {
  it('restores a stored condition into an editable row', () => {
    expect(toDraft({ attribute: 'plan', operator: 'in', values: ['pro', 5] })).toMatchObject({
      attribute: 'plan',
      operator: 'in',
      // Text, because the field is text; coercion happens again on the way out.
      values: ['pro', '5'],
    });
    expect(toDraft({ attribute: 'seats', operator: 'gte', value: 5 })).toMatchObject({
      value: '5',
    });
  });

  it('survives a full circuit unchanged', () => {
    const original = { attribute: 'seats', operator: 'gte', value: 5 } as const;
    expect(convertCondition(toDraft(original)).condition).toEqual(original);
  });

  it('always yields something to type into', () => {
    // `[]` and `[[]]` are both legal stored shapes for "no conditions yet".
    expect(toRuleSetDrafts([])).toHaveLength(1);
    expect(toRuleSetDrafts([])[0]!.conditions).toHaveLength(1);
    expect(toRuleSetDrafts([[]])[0]!.conditions).toHaveLength(1);
  });
});

describe('summaries', () => {
  it('reads a condition in the builder’s own words', () => {
    expect(conditionText({ attribute: 'plan', operator: 'in', values: ['pro', 'team'] })).toBe(
      'plan is one of pro, team',
    );
    expect(conditionText({ attribute: 'seats', operator: 'gte', value: 5 })).toBe(
      'seats is at least 5',
    );
    expect(conditionText({ attribute: 'email', operator: 'exists' })).toBe('email is present');
  });

  it('calls a segment with no conditions Everyone', () => {
    expect(rulesSummary([], 'all')).toEqual({ text: 'Everyone', hiddenCount: 0 });
    expect(rulesSummary([[]], 'all')).toEqual({ text: 'Everyone', hiddenCount: 0 });
    expect(structureLabel([[]], 'all')).toBe('No conditions');
  });

  it('truncates by condition, never mid-condition', () => {
    const group = [
      { attribute: 'a', operator: 'eq', value: 1 },
      { attribute: 'b', operator: 'eq', value: 2 },
      { attribute: 'c', operator: 'eq', value: 3 },
    ] as const;
    const summary = rulesSummary([[...group]], 'all');
    // Half a condition reads as a value that ends early, which misleads; a count
    // does not.
    expect(summary.text).toBe('a is 1 AND b is 2');
    expect(summary.hiddenCount).toBe(1);
  });

  it('summarises several groups by shape, with the operator in force', () => {
    const rules = [
      [
        { attribute: 'plan', operator: 'eq' as const, value: 'pro' },
        { attribute: 'region', operator: 'eq' as const, value: 'eu' },
      ],
      [{ attribute: 'country', operator: 'eq' as const, value: 'us' }],
    ];
    expect(rulesSummary(rules, 'any').text).toBe('(plan is pro +1) OR (country is us)');
    expect(rulesSummary(rules, 'all').text).toBe('(plan is pro +1) AND (country is us)');
    expect(structureLabel(rules, 'any')).toBe('2 rule sets (OR)');
  });

  it('counts conditions across every group', () => {
    expect(conditionCount([[{ attribute: 'a', operator: 'exists' }], []])).toBe(1);
    expect(
      conditionCount([
        [
          { attribute: 'a', operator: 'exists' },
          { attribute: 'b', operator: 'exists' },
        ],
        [{ attribute: 'c', operator: 'exists' }],
      ]),
    ).toBe(3);
  });

  it('pluralises a single condition', () => {
    expect(structureLabel([[{ attribute: 'a', operator: 'exists' }]], 'all')).toBe('1 condition');
  });
});
