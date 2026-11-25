import { describe, expect, it } from 'vitest';

import {
  eraDataConfigSchema,
  eraDataShellSchema,
} from './era-data-config.schema';

const VALID = {
  identity: { name: 'Fourth era' },
  dataSubdir: 'fourth-era',
};

describe('eraDataShellSchema', () => {
  it('accepts a non-empty array, leaving the entries unparsed', () => {
    expect(eraDataShellSchema.parse([VALID, 7])).toEqual([VALID, 7]);
  });

  it('rejects an empty array and a non-array with the same message', () => {
    for (const value of [[], 'nope', undefined, { eras: [] }]) {
      const result = eraDataShellSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'must be a non-empty array of eras.',
      );
    }
  });
});

describe('eraDataConfigSchema', () => {
  it('accepts a complete era', () => {
    expect(eraDataConfigSchema.parse(VALID)).toEqual(VALID);
  });

  it('ignores the stale identity.rulesSets and dates keys', () => {
    const parsed = eraDataConfigSchema.parse({
      identity: { name: 'Fourth era', rulesSets: ['BB2020'] },
      dates: { startDate: '2020-11-28', endDate: '2021-06-01' },
      dataSubdir: 'fourth-era',
    });
    expect(parsed).toEqual(VALID);
  });

  it('rejects a non-object at the root', () => {
    const result = eraDataConfigSchema.safeParse(7);
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe('must be an object.');
  });

  it('rejects a blank identity.name', () => {
    const result = eraDataConfigSchema.safeParse({
      ...VALID,
      identity: { name: '' },
    });
    expect(result.error?.issues[0].path).toEqual(['identity', 'name']);
  });

  it('rejects a blank dataSubdir', () => {
    const result = eraDataConfigSchema.safeParse({
      ...VALID,
      dataSubdir: '  ',
    });
    expect(result.error?.issues[0].path).toEqual(['dataSubdir']);
    expect(result.error?.issues[0].message).toBe('must be a non-empty string.');
  });
});
