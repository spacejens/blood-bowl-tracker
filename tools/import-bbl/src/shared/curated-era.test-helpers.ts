import type { Era } from '@blood-bowl-tracker/api-contract';

/**
 * Test-only helper. Do not import from production code.
 *
 * A curated era as the eras step's upsert answers with it: the catalog's
 * dates and rules sets, which the importer reads back instead of declaring
 * them in its own config. Pass overrides for the fields a test cares about.
 */
export function era(overrides: Partial<Era> = {}): Era {
  return {
    id: 1,
    name: 'First era',
    leagueId: 1,
    rulesSetIds: [],
    rulesSetNames: [],
    startDate: '2011-09-09',
    endDate: null,
    createdAt: new Date(0),
    ...overrides,
  };
}
