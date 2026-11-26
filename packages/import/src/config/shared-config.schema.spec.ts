import { describe, expect, it } from 'vitest';

import {
  configGroupSchema,
  connectionConfigSchema,
  nonBlankStringSchema,
  nonEmptyStringSchema,
  optionalIsoDateSchema,
} from './shared-config.schema';

describe('optionalIsoDateSchema', () => {
  it('accepts undefined', () => {
    expect(optionalIsoDateSchema.parse(undefined)).toBeUndefined();
  });

  it('accepts a real calendar day', () => {
    expect(optionalIsoDateSchema.parse('2020-11-28')).toBe('2020-11-28');
  });

  it('rejects a bad date with the "when present" message', () => {
    const result = optionalIsoDateSchema.safeParse('2020-13-01');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'must be an ISO date (YYYY-MM-DD) when present.',
    );
  });
});

describe('nonEmptyStringSchema', () => {
  it('accepts a non-empty string', () => {
    expect(nonEmptyStringSchema.parse('data/')).toBe('data/');
  });

  it('rejects an empty string and undefined', () => {
    expect(nonEmptyStringSchema.safeParse('').success).toBe(false);
    expect(nonEmptyStringSchema.safeParse(undefined).success).toBe(false);
  });
});

describe('nonBlankStringSchema', () => {
  it('keeps the original, untrimmed value', () => {
    expect(nonBlankStringSchema.parse(' Fourth era ')).toBe(' Fourth era ');
  });

  it('rejects a blank string with its message tail', () => {
    const result = nonBlankStringSchema.safeParse('   ');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('must be a non-empty string.');
  });

  it('rejects a non-string with the same message tail', () => {
    const result = nonBlankStringSchema.safeParse(7);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('must be a non-empty string.');
  });
});

describe('configGroupSchema', () => {
  it('keeps an object group as-is', () => {
    expect(configGroupSchema.parse({ apiToken: 'secret' })).toEqual({
      apiToken: 'secret',
    });
  });

  it('turns anything that is not an object into an empty group', () => {
    expect(configGroupSchema.parse(undefined)).toEqual({});
    expect(configGroupSchema.parse(null)).toEqual({});
    expect(configGroupSchema.parse('nope')).toEqual({});
    expect(configGroupSchema.parse(7)).toEqual({});
    expect(configGroupSchema.parse([1, 2, 3])).toEqual({});
  });
});

describe('connectionConfigSchema', () => {
  it('reads both fields', () => {
    expect(
      connectionConfigSchema.parse({
        apiBaseUrl: 'http://localhost:4000',
        apiToken: 'secret',
      }),
    ).toMatchObject({
      apiBaseUrl: 'http://localhost:4000',
      apiToken: 'secret',
    });
  });

  it('accepts an empty connection group, leaving both fields undefined', () => {
    const parsed = connectionConfigSchema.parse({});
    expect(parsed.apiBaseUrl).toBeUndefined();
    expect(parsed.apiToken).toBeUndefined();
  });

  it('treats an empty or non-string field as unset rather than failing', () => {
    const parsed = connectionConfigSchema.parse({
      apiBaseUrl: '',
      apiToken: 42,
    });
    expect(parsed.apiBaseUrl).toBeUndefined();
    expect(parsed.apiToken).toBeUndefined();
  });

  it('keeps unknown keys instead of rejecting them', () => {
    const parsed = connectionConfigSchema.parse({ somethingElse: true });
    expect(parsed.somethingElse).toBe(true);
  });

  it('fails only when connection is not an object', () => {
    expect(connectionConfigSchema.safeParse(undefined).success).toBe(false);
    expect(connectionConfigSchema.safeParse(null).success).toBe(false);
    expect(connectionConfigSchema.safeParse('nope').success).toBe(false);
  });
});
