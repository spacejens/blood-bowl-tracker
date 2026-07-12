import { describe, expect, it } from 'vitest';

import { RulesSetSchema, UpsertRulesSetSchema } from './rules-set';

describe('rules set schemas', () => {
  it('RulesSetSchema parses a valid rules set', () => {
    const parsed = RulesSetSchema.parse({
      id: 1,
      name: 'BB2020',
      races: [7, 8],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('BB2020');
    expect(parsed.races).toEqual([7, 8]);
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('UpsertRulesSetSchema defaults races to an empty array when omitted', () => {
    const parsed = UpsertRulesSetSchema.parse({
      name: 'BB2020',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    });
    expect(parsed.races).toEqual([]);
  });

  it('UpsertRulesSetSchema rejects an empty name', () => {
    expect(() =>
      UpsertRulesSetSchema.parse({
        name: '',
        externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      }),
    ).toThrow();
  });

  it('UpsertRulesSetSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertRulesSetSchema.parse({ name: 'X', externalIds: [] }),
    ).toThrow();
  });
});
