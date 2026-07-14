import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../../database-timeout';

export interface StatsSummaryDeps {
  leagues: LeaguesService;
  externalSystems: ExternalSystemsService;
  rulesSets: RulesSetsService;
  races: RacesService;
  positions: PositionsService;
  coaches: CoachesService;
  eras: ErasService;
  competitions: CompetitionsService;
  teams: TeamsService;
  players: PlayersService;
  matches: MatchesService;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

export async function resolveStatsSummary(
  deps: StatsSummaryDeps,
  _eraId?: number,
): Promise<string | InteractionReplyOptions> {
  const counts = await withDatabaseTimeout<number[] | null>(
    Promise.all([
      deps.leagues.countAll(),
      deps.externalSystems.countAll(),
      deps.rulesSets.countAll(),
      deps.races.countAll(),
      deps.positions.countAll(),
      deps.coaches.countAll(),
      deps.eras.countAll(),
      deps.competitions.countAll(),
      deps.competitions.countByType('season'),
      deps.competitions.countByType('cup'),
      deps.teams.countAll(),
      deps.players.countAll(),
      deps.matches.countAll(),
      deps.matches.countMatchEvents(),
    ]),
    null,
  );
  if (counts === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }
  const [
    leagues,
    externalSystems,
    rulesSets,
    races,
    positions,
    coaches,
    eras,
    competitions,
    seasons,
    cups,
    teams,
    players,
    matches,
    matchEvents,
  ] = counts;

  const description = [
    `Leagues: ${fmt(leagues)}`,
    `External systems: ${fmt(externalSystems)}`,
    `Rules sets: ${fmt(rulesSets)}`,
    `Races: ${fmt(races)}`,
    `Positions: ${fmt(positions)}`,
    `Coaches: ${fmt(coaches)}`,
    `Eras: ${fmt(eras)}`,
    `Competitions: ${fmt(competitions)} (${fmt(seasons)} seasons, ${fmt(cups)} cups)`,
    `Teams: ${fmt(teams)}`,
    `Players: ${fmt(players)}`,
    `Matches: ${fmt(matches)}`,
    `Match events: ${fmt(matchEvents)}`,
  ].join('\n');

  return { embeds: [{ title: 'I have knowledge of', description }] };
}
