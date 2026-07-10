import type { AnyContractProcedure } from '@orpc/contract';
import { describe, expect, it } from 'vitest';

import { contract } from './contract';
import { UpsertCoachSchema } from './schemas/coach';

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

  it('requires at least one external ID when upserting a coach', () => {
    const result = UpsertCoachSchema.safeParse({
      name: 'Roze Madder',
      externalIds: [],
    });
    expect(result.success).toBe(false);
  });
});
