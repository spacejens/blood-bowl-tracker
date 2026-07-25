import type {
  UpsertCompetition,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';

import type { BblMatchEvents } from '../matches/match-events-page-parser';

export const MATCH_BBL_ID = '89';
export const MATCH_DB_ID = 42;
export const HOME_TEAM_ERA_ID = 1000;
export const AWAY_TEAM_ERA_ID = 2000;
export const BBL_SYSTEM_ID = 1;

/**
 * Test-only helper. Do not import from production code.
 *
 * Fixture data shared across the match-events-import specs.
 */
export const competition: UpsertCompetition = {
  name: 'Major Season 3',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: BBL_SYSTEM_ID, externalId: '3' }],
};

export const homeTeam: UpsertTeam = {
  name: 'Home',
  raceId: 70,
  coachId: 9,
  eras: [],
  externalIds: [],
};
export const awayTeam: UpsertTeam = {
  name: 'Away',
  raceId: 71,
  coachId: 10,
  eras: [],
  externalIds: [],
};

/**
 * Test-only helper. Do not import from production code.
 */
export function makeEvents(
  parts: Partial<
    Pick<BblMatchEvents, 'actions' | 'consequences' | 'journeymenCount'>
  >,
): BblMatchEvents {
  return {
    bblId: MATCH_BBL_ID,
    homeTeamId: 'hme',
    awayTeamId: 'awy',
    actions: parts.actions ?? [],
    consequences: parts.consequences ?? [],
    journeymenCount: parts.journeymenCount,
  };
}

/**
 * Test-only helper. Do not import from production code.
 *
 * The full upsertTeam result record (TeamsImportService.upsertTeam resolves
 * the API's Team + created shape). The subject under test only reads `.eras`,
 * so the other fields are unremarkable defaults.
 */
export function makeTeamRecord(eras: { id: number; eraId: number }[]) {
  return {
    id: 1,
    name: 'Team',
    raceId: 1,
    coachId: 1,
    eras,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}
