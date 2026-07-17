import type { AnyContractProcedure } from '@orpc/contract';
import { describe, expect, it } from 'vitest';

import { contract } from './contract';
import { UpsertCoachSchema } from './schemas/coach';
import {
  SyncPositionRaceErasSchema,
  UpsertPositionSchema,
} from './schemas/position';

function errorCodesOf(procedure: AnyContractProcedure): string[] {
  const errorMap = procedure['~orpc'].errorMap as Record<string, unknown>;
  return Object.keys(errorMap);
}

describe('contract', () => {
  it('defines coaches.upsert with a CONFLICT error', () => {
    expect(errorCodesOf(contract.coaches.upsert)).toEqual(['CONFLICT']);
  });

  it('defines externalSystems.upsert with no declared errors', () => {
    expect(errorCodesOf(contract.externalSystems.upsert)).toEqual([]);
  });

  it('defines positions.upsert with a CONFLICT error', () => {
    expect(errorCodesOf(contract.positions.upsert)).toEqual(['CONFLICT']);
  });

  it('defines players.upsert with a CONFLICT error', () => {
    expect(errorCodesOf(contract.players.upsert)).toEqual(['CONFLICT']);
  });

  it('requires at least one external ID when upserting a coach', () => {
    const result = UpsertCoachSchema.safeParse({
      name: 'Roze Madder',
      externalIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid syncRaceEras input', () => {
    expect(() =>
      SyncPositionRaceErasSchema.parse({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      }),
    ).not.toThrow();
  });

  it('strips a races field from an upsert payload', () => {
    const parsed = UpsertPositionSchema.safeParse({
      name: 'Lineman',
      isStarPlayer: false,
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      races: [{ raceId: 1, isDeleted: false }],
    });
    expect(parsed.success).toBe(true);
    expect((parsed.data as Record<string, unknown>).races).toBeUndefined();
  });
});
