import { describe, expect, it } from 'vitest';

import {
  configGroupSchema,
  nonEmptyStringSchema,
  overrideIdsSchema,
  positiveIntegerSchema,
} from './review-config.schema';

describe('configGroupSchema', () => {
  it('passes an object through', () => {
    expect(configGroupSchema.parse({ url: 'postgres://x' })).toEqual({
      url: 'postgres://x',
    });
  });

  it('yields an empty object for an absent or non-object group', () => {
    expect(configGroupSchema.parse(undefined)).toEqual({});
    expect(configGroupSchema.parse(null)).toEqual({});
    expect(configGroupSchema.parse('nope')).toEqual({});
    expect(configGroupSchema.parse(7)).toEqual({});
  });
});

describe('nonEmptyStringSchema', () => {
  it('accepts a non-empty string and rejects everything else', () => {
    expect(nonEmptyStringSchema.parse('x')).toBe('x');
    expect(nonEmptyStringSchema.safeParse('').success).toBe(false);
    expect(nonEmptyStringSchema.safeParse(undefined).success).toBe(false);
    expect(nonEmptyStringSchema.safeParse(3).success).toBe(false);
  });
});

describe('positiveIntegerSchema', () => {
  it('accepts a positive integer', () => {
    expect(positiveIntegerSchema.parse(5)).toBe(5);
  });

  it('rejects zero, negatives, fractions and non-numbers', () => {
    expect(positiveIntegerSchema.safeParse(0).success).toBe(false);
    expect(positiveIntegerSchema.safeParse(-1).success).toBe(false);
    expect(positiveIntegerSchema.safeParse(1.5).success).toBe(false);
    expect(positiveIntegerSchema.safeParse('3').success).toBe(false);
  });
});

describe('overrideIdsSchema', () => {
  it('accepts any array, whatever the entries are', () => {
    expect(overrideIdsSchema.parse(['a', 7])).toEqual(['a', 7]);
    expect(overrideIdsSchema.parse([])).toEqual([]);
  });

  it('rejects a non-array', () => {
    expect(overrideIdsSchema.safeParse('a').success).toBe(false);
    expect(overrideIdsSchema.safeParse({ a: 1 }).success).toBe(false);
  });
});
