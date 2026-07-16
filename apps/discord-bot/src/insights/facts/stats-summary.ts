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
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  if (competitionId !== undefined) {
    return resolveCompetitionStats(deps, competitionId);
  }
  return eraId === undefined
    ? resolveAllTimeStats(deps)
    : resolveEraStats(deps, eraId);
}

async function resolveAllTimeStats(
  deps: StatsSummaryDeps,
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
    `Eras: ${fmt(eras)}`,
    `External systems: ${fmt(externalSystems)}`,
    `Rules sets: ${fmt(rulesSets)}`,
    `Races: ${fmt(races)}`,
    `Positions: ${fmt(positions)}`,
    `Coaches: ${fmt(coaches)}`,
    `Competitions: ${fmt(competitions)} (${fmt(seasons)} seasons, ${fmt(cups)} cups)`,
    `Teams: ${fmt(teams)}`,
    `Players: ${fmt(players)}`,
    `Matches: ${fmt(matches)}`,
    `Match events: ${fmt(matchEvents)}`,
  ].join('\n');

  return { embeds: [{ title: 'Statistics', description }] };
}

async function resolveEraStats(
  deps: StatsSummaryDeps,
  eraId: number,
): Promise<string | InteractionReplyOptions> {
  const data = await withDatabaseTimeout<{
    externalSystems: number;
    races: number;
    positions: number;
    coaches: number;
    competitions: number;
    seasons: number;
    cups: number;
    teams: number;
    players: number;
    matches: number;
    matchEvents: number;
    rulesSetNames: string[];
  } | null>(
    Promise.all([
      deps.externalSystems.countByEra(eraId),
      deps.races.countByEra(eraId),
      deps.positions.countByEra(eraId),
      deps.coaches.countByEra(eraId),
      deps.competitions.countByEra(eraId),
      deps.competitions.countByType('season', eraId),
      deps.competitions.countByType('cup', eraId),
      deps.teams.countByEra(eraId),
      deps.players.countByEra(eraId),
      deps.matches.countByEra(eraId),
      deps.matches.countMatchEventsByEra(eraId),
      deps.eras.getRulesSetNames(eraId),
    ]).then(
      ([
        externalSystems,
        races,
        positions,
        coaches,
        competitions,
        seasons,
        cups,
        teams,
        players,
        matches,
        matchEvents,
        rulesSetNames,
      ]) => ({
        externalSystems,
        races,
        positions,
        coaches,
        competitions,
        seasons,
        cups,
        teams,
        players,
        matches,
        matchEvents,
        rulesSetNames,
      }),
    ),
    null,
  );
  if (data === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }

  const description = [
    'Leagues: 1',
    'Eras: 1',
    `External systems: ${fmt(data.externalSystems)}`,
    `Rules sets: ${fmt(data.rulesSetNames.length)}`,
    `Races: ${fmt(data.races)}`,
    `Positions: ${fmt(data.positions)}`,
    `Coaches: ${fmt(data.coaches)}`,
    `Competitions: ${fmt(data.competitions)} (${fmt(data.seasons)} seasons, ${fmt(data.cups)} cups)`,
    `Teams: ${fmt(data.teams)}`,
    `Players: ${fmt(data.players)}`,
    `Matches: ${fmt(data.matches)}`,
    `Match events: ${fmt(data.matchEvents)}`,
  ].join('\n');

  return { embeds: [{ title: 'Statistics', description }] };
}

async function resolveCompetitionStats(
  deps: StatsSummaryDeps,
  competitionId: number,
): Promise<string | InteractionReplyOptions> {
  const competition = await deps.competitions.findById(competitionId);
  if (competition === undefined) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }
  const data = await withDatabaseTimeout<{
    externalSystems: number;
    races: number;
    positions: number;
    coaches: number;
    teams: number;
    players: number;
    matches: number;
    matchEvents: number;
    rulesSetNames: string[];
  } | null>(
    Promise.all([
      deps.externalSystems.countByCompetition(competitionId),
      deps.races.countByCompetition(competitionId),
      deps.positions.countByCompetition(competitionId),
      deps.coaches.countByCompetition(competitionId),
      deps.teams.countByCompetition(competitionId),
      deps.players.countByCompetition(competitionId),
      deps.matches.countByCompetition(competitionId),
      deps.matches.countMatchEventsByCompetition(competitionId),
      deps.eras.getRulesSetNames(competition.eraId),
    ]).then(
      ([
        externalSystems,
        races,
        positions,
        coaches,
        teams,
        players,
        matches,
        matchEvents,
        rulesSetNames,
      ]) => ({
        externalSystems,
        races,
        positions,
        coaches,
        teams,
        players,
        matches,
        matchEvents,
        rulesSetNames,
      }),
    ),
    null,
  );
  if (data === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }

  const seasons = competition.type === 'season' ? 1 : 0;
  const cups = competition.type === 'cup' ? 1 : 0;

  const description = [
    'Leagues: 1',
    'Eras: 1',
    `External systems: ${fmt(data.externalSystems)}`,
    `Rules sets: ${fmt(data.rulesSetNames.length)}`,
    `Races: ${fmt(data.races)}`,
    `Positions: ${fmt(data.positions)}`,
    `Coaches: ${fmt(data.coaches)}`,
    `Competitions: 1 (${seasons} seasons, ${cups} cups)`,
    `Teams: ${fmt(data.teams)}`,
    `Players: ${fmt(data.players)}`,
    `Matches: ${fmt(data.matches)}`,
    `Match events: ${fmt(data.matchEvents)}`,
  ].join('\n');

  return { embeds: [{ title: 'Statistics', description }] };
}
