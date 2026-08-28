/** The upsert result record repeated across the coach import specs. */
export interface CoachRecord {
  id: number;
  name: string;
  createdAt: Date;
  created: boolean;
}

/**
 * Test-only helper. Do not import from production code.
 *
 * Builds the coach `upsert` result record. Defaults match the value repeated
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
