import { describe, expect, it } from 'vitest';

import {
  PlayerSchema,
  SyncComputedSppTotalsResultSchema,
  SyncComputedSppTotalsSchema,
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

describe('SyncComputedSppTotals schemas', () => {
  it('parses a list of player ids', () => {
    expect(SyncComputedSppTotalsSchema.parse({ playerIds: [1, 2, 3] })).toEqual(
      {
        playerIds: [1, 2, 3],
      },
    );
  });

  it('accepts an empty player id list', () => {
    expect(SyncComputedSppTotalsSchema.parse({ playerIds: [] })).toEqual({
      playerIds: [],
    });
  });

  it('rejects a non-integer player id', () => {
    expect(() =>
      SyncComputedSppTotalsSchema.parse({ playerIds: [1.5] }),
    ).toThrow();
  });

  it('parses a result of updated player ids', () => {
    expect(
      SyncComputedSppTotalsResultSchema.parse({ updatedPlayerIds: [7, 8] }),
    ).toEqual({ updatedPlayerIds: [7, 8] });
  });
});
