import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  CoachesService,
  CompetitionGroupsService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  KeywordsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  SkillsService,
  TeamsService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  STATS_SUMMARY_ALL_TIME_TIMEOUT_MESSAGE,
  STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE,
  STATS_SUMMARY_COMPETITION_TIMEOUT_MESSAGE,
  STATS_SUMMARY_ERA_TIMEOUT_MESSAGE,
  STATS_SUMMARY_LEAGUE_TIMEOUT_MESSAGE,
} from '../../error-messages';

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
  skills: number;
  keywords: number;
  coaches: number;
  competitions: string;
  /**
   * A plain number in every view: the competition view has exactly one group
   * (`competitions.competitionGroupId` is NOT NULL), so it passes the literal
   * 1 rather than querying for it.
   */
  competitionGroups: number;
  trophies: number;
  teams: number;
  players: number;
  matches: number;
  matchEvents: number;
}

/**
 * Result of the era view's `Promise.all` count query. Element order must match
 * that array exactly: externalSystems, races, positions, skills, keywords,
 * coaches, competitions, seasons, cups, competitionGroups, trophies, teams,
 * players, matches, matchEvents, rulesSetNames.
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
  number,
  number,
  number,
  number,
  string[],
];

/**
 * Result of the competition view's `Promise.all` count query. Element order
 * must match that array exactly: externalSystems, races, positions, skills,
 * keywords, coaches, trophies, teams, players, matches, matchEvents,
 * rulesSetNames.
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
  number,
  number,
  number,
  string[],
];

/**
 * Result of the league view's `Promise.all` count query. Element order must
 * match that array exactly: eraCount, externalSystems, races, positions,
 * skills, keywords, coaches, competitions, seasons, cups, competitionGroups,
 * trophies, teams, players, matches, matchEvents, rulesSetNames.
 */
type LeagueCounts = [
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
  number,
  number,
  number,
  number,
  number,
  string[],
];

@Injectable()
export class StatsSummaryFactsService {
  constructor(
    private readonly leagues: LeaguesService,
    private readonly externalSystems: ExternalSystemsService,
    private readonly rulesSets: RulesSetsService,
    private readonly races: RacesService,
    private readonly positions: PositionsService,
    private readonly skills: SkillsService,
    private readonly keywords: KeywordsService,
    private readonly coaches: CoachesService,
    private readonly eras: ErasService,
    private readonly competitions: CompetitionsService,
    private readonly competitionGroups: CompetitionGroupsService,
    private readonly trophies: TrophiesService,
    private readonly teams: TeamsService,
    private readonly players: PlayersService,
    private readonly matches: MatchesService,
    private readonly databaseTimeout: DatabaseTimeoutService,
  ) {}

  private fmt(n: number): string {
    return n.toLocaleString('en-US');
  }

  async resolve(scope: FactScope): Promise<string | InteractionReplyOptions> {
    if (scope.leagueId !== undefined) {
      return this.resolveLeagueStats(scope.leagueId);
    }
    if (scope.competitionId !== undefined) {
      return this.resolveCompetitionStats(scope.competitionId);
    }
    return scope.eraId === undefined
      ? this.resolveAllTimeStats()
      : this.resolveEraStats(scope.eraId);
  }

  private statsSummaryEmbed(
    values: StatsSummaryValues,
  ): InteractionReplyOptions {
    const description = [
      `Leagues: ${values.leagues}`,
      `Eras: ${values.eras}`,
      `External systems: ${this.fmt(values.externalSystems)}`,
      `Rules sets: ${this.fmt(values.rulesSets)}`,
      `Races: ${this.fmt(values.races)}`,
      `Positions: ${this.fmt(values.positions)}`,
      `Skills: ${this.fmt(values.skills)}`,
      `Keywords: ${this.fmt(values.keywords)}`,
      `Coaches: ${this.fmt(values.coaches)}`,
      `Competitions: ${values.competitions}`,
      `Competition groups: ${this.fmt(values.competitionGroups)}`,
      `Trophies: ${this.fmt(values.trophies)}`,
      `Teams: ${this.fmt(values.teams)}`,
      `Players: ${this.fmt(values.players)}`,
      `Matches: ${this.fmt(values.matches)}`,
      `Match events: ${this.fmt(values.matchEvents)}`,
    ].join('\n');

    return { embeds: [{ title: 'Statistics', description }] };
  }

  private async resolveAllTimeStats(): Promise<
    string | InteractionReplyOptions
  > {
    const counts = await this.databaseTimeout.run<number[] | null>(
      Promise.all([
        this.leagues.countAll(),
        this.externalSystems.countAll(),
        this.rulesSets.countAll(),
        this.races.countAll(),
        this.positions.countAll(),
        this.skills.countAll(),
        this.keywords.countAll(),
        this.coaches.countAll(),
        this.eras.countAll(),
        this.competitions.countAll(),
        this.competitions.countByType('season'),
        this.competitions.countByType('cup'),
        this.competitionGroups.countAll(),
        this.trophies.countAll(),
        this.teams.countAll(),
        this.players.countAll(),
        this.matches.countAll(),
        this.matches.countMatchEvents(),
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
      skills,
      keywords,
      coaches,
      eras,
      competitions,
      seasons,
      cups,
      competitionGroups,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
    ] = counts;

    return this.statsSummaryEmbed({
      leagues: this.fmt(leagues),
      eras: this.fmt(eras),
      externalSystems,
      rulesSets,
      races,
      positions,
      skills,
      keywords,
      coaches,
      competitions: `${this.fmt(competitions)} (${this.fmt(seasons)} seasons, ${this.fmt(cups)} cups)`,
      competitionGroups,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
    });
  }

  private async resolveEraStats(
    eraId: number,
  ): Promise<string | InteractionReplyOptions> {
    const counts = await this.databaseTimeout.run<EraCounts | null>(
      Promise.all([
        this.externalSystems.countByEra(eraId),
        this.races.countByEra(eraId),
        this.positions.countByEra(eraId),
        this.skills.countByEra(eraId),
        this.keywords.countByEra(eraId),
        this.coaches.countByEra(eraId),
        this.competitions.countByEra(eraId),
        this.competitions.countByType('season', eraId),
        this.competitions.countByType('cup', eraId),
        this.competitionGroups.countByEra(eraId),
        this.trophies.countByEra(eraId),
        this.teams.countByEra(eraId),
        this.players.countByEra(eraId),
        this.matches.countByEra(eraId),
        this.matches.countMatchEventsByEra(eraId),
        this.eras.getRulesSetNames(eraId),
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
      skills,
      keywords,
      coaches,
      competitions,
      seasons,
      cups,
      competitionGroups,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
      rulesSetNames,
    ] = counts;

    return this.statsSummaryEmbed({
      leagues: '1',
      eras: '1',
      externalSystems,
      rulesSets: rulesSetNames.length,
      races,
      positions,
      skills,
      keywords,
      coaches,
      competitions: `${this.fmt(competitions)} (${this.fmt(seasons)} seasons, ${this.fmt(cups)} cups)`,
      competitionGroups,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
    });
  }

  private async resolveCompetitionStats(
    competitionId: number,
  ): Promise<string | InteractionReplyOptions> {
    const competition = await this.competitions.findById(competitionId);
    if (competition === undefined) {
      return STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE;
    }
    const counts = await this.databaseTimeout.run<CompetitionCounts | null>(
      Promise.all([
        this.externalSystems.countByCompetition(competitionId),
        this.races.countByCompetition(competitionId),
        this.positions.countByCompetition(competitionId),
        this.skills.countByCompetition(competitionId),
        this.keywords.countByCompetition(competitionId),
        this.coaches.countByCompetition(competitionId),
        this.trophies.countByCompetition(competitionId),
        this.teams.countByCompetition(competitionId),
        this.players.countByCompetition(competitionId),
        this.matches.countByCompetition(competitionId),
        this.matches.countMatchEventsByCompetition(competitionId),
        this.eras.getRulesSetNames(competition.eraId),
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
      skills,
      keywords,
      coaches,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
      rulesSetNames,
    ] = counts;

    const seasons = competition.type === 'season' ? 1 : 0;
    const cups = competition.type === 'cup' ? 1 : 0;

    return this.statsSummaryEmbed({
      leagues: '1',
      eras: '1',
      externalSystems,
      rulesSets: rulesSetNames.length,
      races,
      positions,
      skills,
      keywords,
      coaches,
      competitions: `1 (${seasons} seasons, ${cups} cups)`,
      // A competition belongs to exactly one group, so this is a literal for
      // the same reason `leagues` and `eras` are above.
      competitionGroups: 1,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
    });
  }

  private async resolveLeagueStats(
    leagueId: number,
  ): Promise<string | InteractionReplyOptions> {
    const counts = await this.databaseTimeout.run<LeagueCounts | null>(
      Promise.all([
        this.eras.countByLeague(leagueId),
        this.externalSystems.countByLeague(leagueId),
        this.races.countByLeague(leagueId),
        this.positions.countByLeague(leagueId),
        this.skills.countByLeague(leagueId),
        this.keywords.countByLeague(leagueId),
        this.coaches.countByLeague(leagueId),
        this.competitions.countByLeague(leagueId),
        this.competitions.countByType('season', undefined, leagueId),
        this.competitions.countByType('cup', undefined, leagueId),
        this.competitionGroups.countByLeague(leagueId),
        this.trophies.countByLeague(leagueId),
        this.teams.countByLeague(leagueId),
        this.players.countByLeague(leagueId),
        this.matches.countByLeague(leagueId),
        this.matches.countMatchEventsByLeague(leagueId),
        this.eras.getRulesSetNamesByLeague(leagueId),
      ]),
      null,
    );
    if (counts === null) {
      return STATS_SUMMARY_LEAGUE_TIMEOUT_MESSAGE;
    }
    const [
      eraCount,
      externalSystems,
      races,
      positions,
      skills,
      keywords,
      coaches,
      competitions,
      seasons,
      cups,
      competitionGroups,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
      rulesSetNames,
    ] = counts;

    return this.statsSummaryEmbed({
      leagues: '1',
      eras: this.fmt(eraCount),
      externalSystems,
      rulesSets: rulesSetNames.length,
      races,
      positions,
      skills,
      keywords,
      coaches,
      competitions: `${this.fmt(competitions)} (${this.fmt(seasons)} seasons, ${this.fmt(cups)} cups)`,
      competitionGroups,
      trophies,
      teams,
      players,
      matches,
      matchEvents,
    });
  }
}
