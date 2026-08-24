import { describe, expect, it } from 'vitest';

import {
  connectionConfigSchema,
  externalSystemNameSchema,
  isoDateSchema,
  nonEmptyStringSchema,
  optionalIsoDateSchema,
} from './shared-config.schema';

describe('isoDateSchema', () => {
  it('accepts a real calendar day', () => {
    expect(isoDateSchema.parse('2021-02-28')).toBe('2021-02-28');
  });

  it('rejects a non-ISO shape with its custom message', () => {
    const result = isoDateSchema.safeParse('28/02/2021');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'must be an ISO date (YYYY-MM-DD).',
    );
  });

  it('rejects a day that does not exist in that month', () => {
    expect(isoDateSchema.safeParse('2021-02-30').success).toBe(false);
  });

  it('rejects a non-string with the same custom message', () => {
    const result = isoDateSchema.safeParse(20210228);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'must be an ISO date (YYYY-MM-DD).',
    );
  });
});

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

describe('externalSystemNameSchema', () => {
  it('accepts a name', () => {
    expect(externalSystemNameSchema.parse('BBL')).toBe('BBL');
  });

  it('rejects a whitespace-only name', () => {
    expect(externalSystemNameSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(externalSystemNameSchema.safeParse(7).success).toBe(false);
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
