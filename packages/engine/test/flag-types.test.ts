import { describe, expect, it } from 'vitest';

import {
  FLAG_TYPES,
  FLAG_VALUE_TYPES,
  flagType,
  flagValueTypeSchema,
  isFlagValueType,
  resolveValue,
} from '../src/flag-types';

const NO_OPTIONS = { enumOptions: [] };
const MODELS = { enumOptions: ['fast', 'balanced', 'quality'] };

describe('FLAG_VALUE_TYPES', () => {
  it('is the single source of truth shared with the DB enum and the wire format', () => {
    // apps/api/src/db/schema.ts builds its pgEnum from this tuple, so a change
    // here is a migration. That is deliberate - it makes drift impossible.
    expect(FLAG_VALUE_TYPES).toEqual(['boolean', 'string', 'string_enum']);
  });

  it('has a descriptor for every member, keyed by its own type', () => {
    for (const type of FLAG_VALUE_TYPES) {
      expect(FLAG_TYPES[type].type).toBe(type);
      expect(FLAG_TYPES[type].label.length).toBeGreaterThan(0);
      expect(FLAG_TYPES[type].hint.length).toBeGreaterThan(0);
    }
    expect(Object.keys(FLAG_TYPES)).toHaveLength(FLAG_VALUE_TYPES.length);
  });

  it('accepts its members and rejects anything else', () => {
    expect(flagValueTypeSchema.safeParse('string_enum').success).toBe(true);
    expect(flagValueTypeSchema.safeParse('number').success).toBe(false);
    expect(isFlagValueType('boolean')).toBe(true);
    expect(isFlagValueType('json')).toBe(false);
  });
});

describe('flagType', () => {
  it('resolves each known type', () => {
    expect(flagType('string').type).toBe('string');
    expect(flagType('string_enum').requiresOptions).toBe(true);
  });

  it('degrades an unknown type to boolean instead of throwing', () => {
    // An older evaluator must survive meeting a snapshot from a newer control
    // plane - that is the whole additive-field contract. Taking the SDK down
    // because a flag has a type it has not heard of is the wrong failure.
    expect(flagType('number').type).toBe('boolean');
    expect(flagType('').type).toBe('boolean');
  });
});

describe('valueSchema', () => {
  it('boolean accepts only booleans', () => {
    expect(FLAG_TYPES.boolean.valueSchema(NO_OPTIONS).safeParse(true).success).toBe(true);
    expect(FLAG_TYPES.boolean.valueSchema(NO_OPTIONS).safeParse('true').success).toBe(false);
  });

  it('string accepts text and rejects other JSON types', () => {
    const schema = FLAG_TYPES.string.valueSchema(NO_OPTIONS);
    expect(schema.safeParse('').success).toBe(true);
    expect(schema.safeParse('a message').success).toBe(true);
    expect(schema.safeParse(42).success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  });

  it('string caps length so a flag cannot become a document store', () => {
    const schema = FLAG_TYPES.string.valueSchema(NO_OPTIONS);
    expect(schema.safeParse('x'.repeat(10_000)).success).toBe(true);
    expect(schema.safeParse('x'.repeat(10_001)).success).toBe(false);
  });

  it('string_enum accepts only declared members', () => {
    const schema = FLAG_TYPES.string_enum.valueSchema(MODELS);
    expect(schema.safeParse('balanced').success).toBe(true);
    expect(schema.safeParse('turbo').success).toBe(false);
  });

  it('string_enum names the legal members in its error, which is the actionable part', () => {
    const result = FLAG_TYPES.string_enum.valueSchema(MODELS).safeParse('turbo');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('expected one of: fast, balanced, quality');
    }
  });

  it('string_enum with no options rejects everything with a clear reason', () => {
    // Both the CHECK constraint and the route validator forbid reaching this
    // state; if one is ever bypassed the message should still explain itself
    // rather than read as "invalid enum value".
    const result = FLAG_TYPES.string_enum.valueSchema(NO_OPTIONS).safeParse('anything');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('this flag has no options defined yet');
    }
  });
});

describe('initialValue', () => {
  it('gives each type a usable starting value', () => {
    expect(FLAG_TYPES.boolean.initialValue(NO_OPTIONS)).toBe(false);
    expect(FLAG_TYPES.string.initialValue(NO_OPTIONS)).toBe('');
    expect(FLAG_TYPES.string_enum.initialValue(MODELS)).toBe('fast');
  });

  it('string_enum falls back to empty rather than undefined with no options', () => {
    expect(FLAG_TYPES.string_enum.initialValue(NO_OPTIONS)).toBe('');
  });

  it("every type's initial value satisfies its own schema", () => {
    for (const type of FLAG_VALUE_TYPES) {
      const descriptor = FLAG_TYPES[type];
      const constraints = descriptor.requiresOptions ? MODELS : NO_OPTIONS;
      const initial = descriptor.initialValue(constraints);
      expect(descriptor.valueSchema(constraints).safeParse(initial).success).toBe(true);
    }
  });
});

describe('format', () => {
  it('renders each type as text and never throws on null', () => {
    expect(FLAG_TYPES.boolean.format(true)).toBe('true');
    expect(FLAG_TYPES.boolean.format(false)).toBe('false');
    expect(FLAG_TYPES.boolean.format(null)).toBe('false');
    expect(FLAG_TYPES.string.format('hello')).toBe('hello');
    expect(FLAG_TYPES.string.format(null)).toBe('');
    expect(FLAG_TYPES.string_enum.format('quality')).toBe('quality');
    expect(FLAG_TYPES.string_enum.format(null)).toBe('');
  });

  it('survives a value of the wrong runtime type', () => {
    // Values arrive from jsonb and from other people's SDK calls; a table cell
    // must render something rather than crash the page.
    for (const type of FLAG_VALUE_TYPES) {
      expect(() => FLAG_TYPES[type].format(42)).not.toThrow();
      expect(() => FLAG_TYPES[type].format({ nested: true })).not.toThrow();
    }
  });
});

describe('resolveValue', () => {
  const base = { value: null, defaultValue: null, fallback: null };

  it('a boolean flag serves `enabled`, ignoring any stored value', () => {
    expect(resolveValue({ ...base, valueType: 'boolean', enabled: true, value: 'ignored' })).toBe(
      true,
    );
    expect(resolveValue({ ...base, valueType: 'boolean', enabled: false, value: 'ignored' })).toBe(
      false,
    );
  });

  it('an on string flag serves the environment value', () => {
    expect(
      resolveValue({
        valueType: 'string',
        enabled: true,
        value: 'env value',
        defaultValue: 'definition default',
        fallback: 'fallback',
      }),
    ).toBe('env value');
  });

  it('an on string flag with no environment value inherits the definition default', () => {
    expect(
      resolveValue({
        valueType: 'string',
        enabled: true,
        value: null,
        defaultValue: 'definition default',
        fallback: 'fallback',
      }),
    ).toBe('definition default');
  });

  it('an off string flag serves the fallback, not its value', () => {
    expect(
      resolveValue({
        valueType: 'string',
        enabled: false,
        value: 'env value',
        defaultValue: 'definition default',
        fallback: 'the fallback',
      }),
    ).toBe('the fallback');
  });

  it('an off string flag with no fallback resolves to null', () => {
    expect(
      resolveValue({
        valueType: 'string',
        enabled: false,
        value: 'v',
        defaultValue: 'd',
        fallback: null,
      }),
    ).toBeNull();
  });

  it('resolves string_enum the same way as string', () => {
    expect(
      resolveValue({
        valueType: 'string_enum',
        enabled: true,
        value: 'quality',
        defaultValue: 'fast',
        fallback: 'fast',
      }),
    ).toBe('quality');
  });

  it('degrades an unknown type to boolean behaviour', () => {
    expect(
      resolveValue({
        // Cast because the union forbids it - the point is what happens when
        // a newer control plane's type reaches an older evaluator anyway.
        valueType: 'number' as never,
        enabled: true,
        value: 42,
        defaultValue: null,
        fallback: null,
      }),
    ).toBe(true);
  });
});
