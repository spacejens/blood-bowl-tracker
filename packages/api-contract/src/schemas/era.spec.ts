import { describe, expect, it } from 'vitest';

import { EraSchema, UpsertEraSchema } from './era';

describe('era schemas', () => {
  it('EraSchema parses a valid era with a null endDate', () => {
    const parsed = EraSchema.parse({
      id: 1,
      name: 'Living rulebook',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2011-09-09',
      endDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.endDate).toBeNull();
    expect(parsed.startDate).toBe('2011-09-09');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('EraSchema parses rulesSetIds as a number array', () => {
    const parsed = EraSchema.parse({
      id: 1,
      name: 'Living rulebook',
      leagueId: 10,
      rulesSetIds: [20, 21],
      startDate: '2011-09-09',
      endDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.rulesSetIds).toEqual([20, 21]);
  });

  it('UpsertEraSchema accepts an era without an endDate', () => {
    const parsed = UpsertEraSchema.parse({
      name: 'Ongoing',
      leagueId: 10,
      rulesSetIds: [20],
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
        rulesSetIds: [1],
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
        rulesSetIds: [1],
        startDate: '2011-09-09',
        externalIds: [],
      }),
    ).toThrow();
  });

  it('UpsertEraSchema accepts an externalIds-only rename payload', () => {
    const parsed = UpsertEraSchema.parse({
      name: 'Renamed era',
      externalIds: [{ externalSystemId: 1, externalId: 'Renamed era' }],
    });
    expect(parsed.leagueId).toBeUndefined();
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
    expect(parsed.rulesSetIds).toEqual([]);
  });

  it('UpsertEraSchema distinguishes an explicit null endDate from an omitted one', () => {
    const cleared = UpsertEraSchema.parse({
      endDate: null,
      externalIds: [{ externalSystemId: 1, externalId: 'X' }],
    });
    const omitted = UpsertEraSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: 'X' }],
    });
    expect(cleared.endDate).toBeNull();
    expect(omitted.endDate).toBeUndefined();
  });

  it('UpsertEraSchema still rejects a null name — there is no era with no name', () => {
    expect(() =>
      UpsertEraSchema.parse({
        name: null,
        externalIds: [{ externalSystemId: 1, externalId: 'X' }],
      }),
    ).toThrow();
  });
});
