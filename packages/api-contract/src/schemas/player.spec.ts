import { describe, expect, it } from 'vitest';

import {
  PlayerSchema,
  SyncReportedSppAdjustmentsSchema,
  SyncScrapedSppAdjustmentsSchema,
  SyncSppAdjustmentsResultSchema,
  UpsertPlayerSchema,
} from './player';

describe('player schemas', () => {
  it('PlayerSchema parses a valid player', () => {
    const parsed = PlayerSchema.parse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('Griff Oberwald');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('UpsertPlayerSchema accepts an empty name', () => {
    // Some BBL players legitimately have no name (see issue #131) — unlike
    // other entities, players are not required to have a non-empty name.
    const parsed = UpsertPlayerSchema.parse({
      name: '',
      teamEraId: 10,
      positionId: 20,
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.name).toBe('');
  });

  it('UpsertPlayerSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        externalIds: [],
      }),
    ).toThrow();
  });

  it('UpsertPlayerSchema accepts an externalIds-only payload', () => {
    const parsed = UpsertPlayerSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.name).toBeUndefined();
    expect(parsed.teamEraId).toBeUndefined();
    expect(parsed.positionId).toBeUndefined();
  });

  it('UpsertPlayerSchema accepts an optional integer sppTotal', () => {
    const parsed = UpsertPlayerSchema.parse({
      sppTotal: 176,
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.sppTotal).toBe(176);
  });

  it('UpsertPlayerSchema leaves sppTotal undefined when omitted', () => {
    // "undefined means no instruction about that column" — an omitted
    // sppTotal must never clobber a previously-set value.
    const parsed = UpsertPlayerSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.sppTotal).toBeUndefined();
  });

  it('UpsertPlayerSchema rejects a non-integer sppTotal', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        sppTotal: 1.5,
        externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      }),
    ).toThrow();
  });
});

describe('SyncScrapedSppAdjustmentsSchema', () => {
  it('accepts a scraped total and a null scraped total', () => {
    const parsed = SyncScrapedSppAdjustmentsSchema.parse({
      players: [
        { playerId: 1, scrapedTotal: 16 },
        { playerId: 2, scrapedTotal: null },
      ],
    });

    expect(parsed.players).toHaveLength(2);
    expect(parsed.players[1].scrapedTotal).toBeNull();
  });

  it('rejects a missing scrapedTotal — omitted and null are different answers', () => {
    expect(() =>
      SyncScrapedSppAdjustmentsSchema.parse({ players: [{ playerId: 1 }] }),
    ).toThrow();
  });

  it('rejects a non-integer scraped total', () => {
    expect(() =>
      SyncScrapedSppAdjustmentsSchema.parse({
        players: [{ playerId: 1, scrapedTotal: 1.5 }],
      }),
    ).toThrow();
  });
});

describe('SyncReportedSppAdjustmentsSchema', () => {
  it('accepts a list of player ids', () => {
    expect(
      SyncReportedSppAdjustmentsSchema.parse({ playerIds: [1, 2] }),
    ).toEqual({ playerIds: [1, 2] });
  });

  it('rejects a non-integer player id', () => {
    expect(() =>
      SyncReportedSppAdjustmentsSchema.parse({ playerIds: [1.5] }),
    ).toThrow();
  });
});

describe('SyncSppAdjustmentsResultSchema', () => {
  it('accepts the updated player ids', () => {
    expect(
      SyncSppAdjustmentsResultSchema.parse({ updatedPlayerIds: [3] }),
    ).toEqual({ updatedPlayerIds: [3] });
  });
});
