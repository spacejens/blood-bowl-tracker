import { describe, expect, it } from 'vitest';

import { EraSchema, UpsertEraSchema } from './era';

describe('era schemas', () => {
  it('EraSchema parses a valid era with a null endDate', () => {
    const parsed = EraSchema.parse({
      id: 1,
      name: 'Living rulebook',
      leagueId: 10,
      rulesSetId: 20,
      startDate: '2011-09-09',
      endDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.endDate).toBeNull();
    expect(parsed.startDate).toBe('2011-09-09');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('UpsertEraSchema accepts an era without an endDate', () => {
    const parsed = UpsertEraSchema.parse({
      name: 'Ongoing',
      leagueId: 10,
      rulesSetId: 20,
      startDate: '2023-06-10',
      externalIds: [{ externalSystemId: 1, externalId: 'Ongoing' }],
    });
    expect(parsed.endDate).toBeUndefined();
  });

  it('UpsertEraSchema rejects a non-ISO startDate', () => {
    expect(() =>
      UpsertEraSchema.parse({
        name: 'X',
        leagueId: 1,
        rulesSetId: 1,
        startDate: '09-09-2011',
        externalIds: [{ externalSystemId: 1, externalId: 'X' }],
      }),
    ).toThrow();
  });

  it('UpsertEraSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertEraSchema.parse({
        name: 'X',
        leagueId: 1,
        rulesSetId: 1,
        startDate: '2011-09-09',
        externalIds: [],
      }),
    ).toThrow();
  });
});
