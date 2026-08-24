import { describe, expect, it } from 'vitest';

import { eraDataConfigSchema } from './era-data-config.schema';

const VALID = {
  identity: { name: 'Fourth era', rulesSets: ['BB2020'] },
  dates: { startDate: '2020-11-28' },
  dataSubdir: 'fourth-era',
};

describe('eraDataConfigSchema', () => {
  it('accepts a complete era', () => {
    const parsed = eraDataConfigSchema.parse({
      ...VALID,
      dates: { startDate: '2020-11-28', endDate: '2021-06-01' },
    });
    expect(parsed.identity.rulesSets).toEqual(['BB2020']);
    expect(parsed.dates.endDate).toBe('2021-06-01');
    expect(parsed.dataSubdir).toBe('fourth-era');
  });

  it('accepts an ongoing era with no endDate', () => {
    expect(eraDataConfigSchema.parse(VALID).dates.endDate).toBeUndefined();
  });

  it('rejects a non-object at the root', () => {
    const result = eraDataConfigSchema.safeParse(7);
    expect(result.error?.issues[0].path).toEqual([]);
    expect(result.error?.issues[0].message).toBe('must be an object.');
  });

  it('rejects a blank identity.name', () => {
    const result = eraDataConfigSchema.safeParse({
      ...VALID,
      identity: { name: '', rulesSets: ['BB2020'] },
    });
    expect(result.error?.issues[0].path).toEqual(['identity', 'name']);
  });

  it('rejects an empty identity.rulesSets', () => {
    const result = eraDataConfigSchema.safeParse({
      ...VALID,
      identity: { name: 'E', rulesSets: [] },
    });
    expect(result.error?.issues[0].path).toEqual(['identity', 'rulesSets']);
    expect(result.error?.issues[0].message).toBe(
      'must be a non-empty array of non-empty strings.',
    );
  });

  it('rejects a bad startDate and a bad endDate', () => {
    expect(
      eraDataConfigSchema.safeParse({
        ...VALID,
        dates: { startDate: '2020-02-31' },
      }).error?.issues[0].path,
    ).toEqual(['dates', 'startDate']);
    expect(
      eraDataConfigSchema.safeParse({
        ...VALID,
        dates: { startDate: '2020-11-28', endDate: 'soon' },
      }).error?.issues[0].path,
    ).toEqual(['dates', 'endDate']);
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
