import type { TpBracketMatch } from '@blood-bowl-tracker/api-contract';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';

import type { TpMatchContext } from './tp-match-context.service';

export const TP_SYSTEM_ID = 1;
export const COMPETITION_ID = 12;
export const COMPETITION_TP_ID = 18442;
export const ERA_ID = 40;
export const HOME_ROSTER_ID = 163386;
export const AWAY_ROSTER_ID = 179769;
export const HOME_TEAM_ERA_ID = 31;
export const AWAY_TEAM_ERA_ID = 32;
export const MATCH_TP_ID = 662796;
export const MATCH_DB_ID = 900;

/** A parsed, completed main-phase TP match with no events. */
export function tpMatch(overrides: Partial<TpMatch> = {}): TpMatch {
  return {
    id: MATCH_TP_ID,
    playedDate: new Date('2026-06-13T14:23:37Z'),
    name: 'Matchday 2',
    homeTeamTpId: HOME_ROSTER_ID,
    awayTeamTpId: AWAY_ROSTER_ID,
    matchEvents: [],
    homeRosterPlayers: [],
    awayRosterPlayers: [],
    phaseType: 160,
    phaseOrder: 1,
    round: 2,
    winner: 'away',
    ...overrides,
  };
}

/** The bracket entry of {@link tpMatch}. */
export function bracketMatch(
  overrides: Partial<TpBracketMatch> = {},
): TpBracketMatch {
  return {
    id: MATCH_TP_ID,
    phaseOrder: 1,
    round: 2,
    homeTeamTpId: HOME_ROSTER_ID,
    awayTeamTpId: AWAY_ROSTER_ID,
    winner: 'away',
    ...overrides,
  };
}

/** A fully resolved season-competition context for {@link tpMatch}. */
export function matchContext(
  overrides: Partial<TpMatchContext> = {},
): TpMatchContext {
  return {
    tpSystemId: TP_SYSTEM_ID,
    competitionId: COMPETITION_ID,
    competitionTpId: COMPETITION_TP_ID,
    competitionType: 'season',
    eraId: ERA_ID,
    homeTeamEraId: HOME_TEAM_ERA_ID,
    awayTeamEraId: AWAY_TEAM_ERA_ID,
    ...overrides,
  };
}
