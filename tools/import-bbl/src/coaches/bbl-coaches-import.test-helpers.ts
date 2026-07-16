import { vi } from 'vitest';

/** The upsertCoach result record repeated across the coach import specs. */
export interface CoachRecord {
  id: number;
  name: string;
  createdAt: Date;
  created: boolean;
}

/**
 * Test-only helper. Do not import from production code.
 *
 * Builds the `upsertCoach` result record. Defaults match the value repeated
 * verbatim across the coach import specs; pass overrides for id/name.
 */
export function makeCoachRecord(
  overrides: Partial<CoachRecord> = {},
): CoachRecord {
  return {
    id: 100,
    name: 'Hugo E',
    createdAt: new Date(),
    created: true,
    ...overrides,
  };
}

/**
 * Test-only helper. Do not import from production code.
 *
 * Builds the two-call external-system upsert mock used by the coach import
 * service: the first call (BBL/system) resolves to external system id 1,
 * the second (Name) resolves to id 2.
 */
export function makeTwoSystemUpsertMock(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
}
