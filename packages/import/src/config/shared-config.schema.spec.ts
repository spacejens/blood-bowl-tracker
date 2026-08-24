import { describe, expect, it } from 'vitest';

import {
  configGroupSchema,
  connectionConfigSchema,
  externalSystemNameSchema,
  isoDateSchema,
  nonBlankStringSchema,
  nonEmptyStringSchema,
  optionalIsoDateSchema,
  rulesSetsSchema,
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

describe('rulesSetsSchema', () => {
  it('accepts a non-empty list of non-empty names', () => {
    expect(rulesSetsSchema.parse(['BB2016', 'BB2020'])).toEqual([
      'BB2016',
      'BB2020',
    ]);
  });

  it('rejects an empty list, a blank entry, and a non-array', () => {
    expect(rulesSetsSchema.safeParse([]).success).toBe(false);
    expect(rulesSetsSchema.safeParse(['BB2020', '  ']).success).toBe(false);
    expect(rulesSetsSchema.safeParse([1]).success).toBe(false);
    expect(rulesSetsSchema.safeParse('BB2020').success).toBe(false);
  });

  it('reports one issue at the field itself', () => {
    const result = rulesSetsSchema.safeParse([]);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe(
      'must be a non-empty array of non-empty strings.',
    );
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
