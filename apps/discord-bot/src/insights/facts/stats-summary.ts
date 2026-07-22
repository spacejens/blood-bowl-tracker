import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  FactScope,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { withDatabaseTimeout } from '../../database-timeout';
import {
  STATS_SUMMARY_ALL_TIME_TIMEOUT_MESSAGE,
  STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE,
  STATS_SUMMARY_COMPETITION_TIMEOUT_MESSAGE,
  STATS_SUMMARY_ERA_TIMEOUT_MESSAGE,
} from '../../error-messages';

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

/**
 * The one description every stats view renders, in the one order. Leagues, eras
 * and competitions arrive pre-rendered because the era and competition views
 * state them as literals ("Leagues: 1") where the all-time view counts them,
 * and the competitions line folds in its seasons/cups breakdown.
 */
interface StatsSummaryValues {
  leagues: string;
  eras: string;
  externalSystems: number;
  rulesSets: number;
  races: number;
  positions: number;
  coaches: number;
  competitions: string;
  teams: number;
  players: number;
  matches: number;
  matchEvents: number;
}

/**
 * Result of the era view's `Promise.all` count query. Element order must match
 * that array exactly: externalSystems, races, positions, coaches, competitions,
 * seasons, cups, teams, players, matches, matchEvents, rulesSetNames.
 */
type EraCounts = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string[],
];

/**
 * Result of the competition view's `Promise.all` count query. Element order
 * must match that array exactly: externalSystems, races, positions, coaches,
 * teams, players, matches, matchEvents, rulesSetNames.
 */
type CompetitionCounts = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string[],
];

function statsSummaryEmbed(
  values: StatsSummaryValues,
): InteractionReplyOptions {
  const description = [
    `Leagues: ${values.leagues}`,
    `Eras: ${values.eras}`,
    `External systems: ${fmt(values.externalSystems)}`,
    `Rules sets: ${fmt(values.rulesSets)}`,
    `Races: ${fmt(values.races)}`,
    `Positions: ${fmt(values.positions)}`,
    `Coaches: ${fmt(values.coaches)}`,
    `Competitions: ${values.competitions}`,
    `Teams: ${fmt(values.teams)}`,
    `Players: ${fmt(values.players)}`,
    `Matches: ${fmt(values.matches)}`,
    `Match events: ${fmt(values.matchEvents)}`,
  ].join('\n');

  return { embeds: [{ title: 'Statistics', description }] };
}

export async function resolveStatsSummary(
  deps: StatsSummaryDeps,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  if (scope.competitionId !== undefined) {
    return resolveCompetitionStats(deps, scope.competitionId);
  }
  return scope.eraId === undefined
    ? resolveAllTimeStats(deps)
    : resolveEraStats(deps, scope.eraId);
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
    return STATS_SUMMARY_ALL_TIME_TIMEOUT_MESSAGE;
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

  return statsSummaryEmbed({
    leagues: fmt(leagues),
    eras: fmt(eras),
    externalSystems,
    rulesSets,
    races,
    positions,
    coaches,
    competitions: `${fmt(competitions)} (${fmt(seasons)} seasons, ${fmt(cups)} cups)`,
    teams,
    players,
    matches,
    matchEvents,
  });
}

async function resolveEraStats(
  deps: StatsSummaryDeps,
  eraId: number,
): Promise<string | InteractionReplyOptions> {
  const counts = await withDatabaseTimeout<EraCounts | null>(
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
    ]),
    null,
  );
  if (counts === null) {
    return STATS_SUMMARY_ERA_TIMEOUT_MESSAGE;
  }
  const [
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
  ] = counts;

  return statsSummaryEmbed({
    leagues: '1',
    eras: '1',
    externalSystems,
    rulesSets: rulesSetNames.length,
    races,
    positions,
    coaches,
    competitions: `${fmt(competitions)} (${fmt(seasons)} seasons, ${fmt(cups)} cups)`,
    teams,
    players,
    matches,
    matchEvents,
  });
}

async function resolveCompetitionStats(
  deps: StatsSummaryDeps,
  competitionId: number,
): Promise<string | InteractionReplyOptions> {
  const competition = await deps.competitions.findById(competitionId);
  if (competition === undefined) {
    return STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE;
  }
  const counts = await withDatabaseTimeout<CompetitionCounts | null>(
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
    ]),
    null,
  );
  if (counts === null) {
    return STATS_SUMMARY_COMPETITION_TIMEOUT_MESSAGE;
  }
  const [
    externalSystems,
    races,
    positions,
    coaches,
    teams,
    players,
    matches,
    matchEvents,
    rulesSetNames,
  ] = counts;

  const seasons = competition.type === 'season' ? 1 : 0;
  const cups = competition.type === 'cup' ? 1 : 0;

  return statsSummaryEmbed({
    leagues: '1',
    eras: '1',
    externalSystems,
    rulesSets: rulesSetNames.length,
    races,
    positions,
    coaches,
    competitions: `1 (${seasons} seasons, ${cups} cups)`,
    teams,
    players,
    matches,
    matchEvents,
  });
}
