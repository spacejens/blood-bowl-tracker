import type { FactScope } from '@blood-bowl-tracker/game-data';
import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  TEAM_TOPLIST_NO_DATA_MESSAGE,
  TEAM_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import { TeamContextService } from '../team-context.service';
import type {
  ScopedCountMethods,
  ToplistResolver,
} from './toplist-factory.service';
import { ToplistFactoryService } from './toplist-factory.service';

/**
 * `countMatchesPlayedByTeam`, `countCompetitionsByTeam`, and `countErasByTeam`
 * take fewer parameters than the (eraId?, competitionId?) shape the factory
 * binds to, but a function accepting fewer optional parameters is still
 * assignable to one expecting more, so `ScopedCountMethods<TeamsService>`
 * would otherwise include them too. Naming the 14 uniform methods explicitly
 * keeps those three out and still gets checked against `ScopedCountMethods`
 * via `satisfies` below, so a genuinely mismatched entry still fails to
 * compile.
 */
const _teamToplistMethods = [
  'countTouchdownsScoredByTeam',
  'countCompletionsByTeam',
  'countInterceptionsByTeam',
  'countDeflectionsByTeam',
  'countCasualtiesCausedByTeam',
  'countSeriousInjuriesCausedByTeam',
  'countDeathsCausedByTeam',
  'countFoulsCommittedByTeam',
  'countTimesSentOffByTeam',
  'countCasualtiesSufferedByTeam',
  'countSeriousInjuriesSufferedByTeam',
  'countLastingInjuriesSufferedByTeam',
  'countDeathsSufferedByTeam',
  'countTrophiesByTeam',
] as const satisfies readonly ScopedCountMethods<TeamsService>[];
type TeamToplistMethod = (typeof _teamToplistMethods)[number];

/**
 * The row shape every team toplist renders. `contextSuffix` is optional so the
 * undecorated rows a `TeamsService` count method returns are still assignable
 * here; `decorateTeamRows` fills it in before the rows reach the embed.
 */
type TeamToplistRow = {
  teamId: number;
  name: string;
  count: number;
  contextSuffix?: string;
};

@Injectable()
export class TeamToplistService {
  private readonly resolvers: Record<
    TeamToplistMethod,
    ToplistResolver<TeamsService>
  >;

  private readonly teamLink: EntityLink<{ teamId: number }> = {
    customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { teamId: number }) => row.teamId,
  };

  constructor(
    private readonly teams: TeamsService,
    private readonly leaderboard: LeaderboardService,
    private readonly teamContext: TeamContextService,
    private readonly toplistFactory: ToplistFactoryService,
  ) {
    this.resolvers = this.toplistFactory.makeResolvers<
      TeamToplistMethod,
      TeamsService,
      TeamToplistRow
    >({
      titles: {
        countTouchdownsScoredByTeam: 'Teams by touchdowns scored',
        countCompletionsByTeam: 'Teams by completions',
        countInterceptionsByTeam: 'Teams by interceptions',
        countDeflectionsByTeam: 'Teams by deflections',
        countCasualtiesCausedByTeam: 'Teams by casualties inflicted',
        countSeriousInjuriesCausedByTeam: 'Teams by serious injuries inflicted',
        countDeathsCausedByTeam: 'Teams by opponents killed',
        countFoulsCommittedByTeam: 'Teams by fouls committed',
        countTimesSentOffByTeam: 'Teams by times sent off',
        countCasualtiesSufferedByTeam: 'Teams by casualties suffered',
        countSeriousInjuriesSufferedByTeam:
          'Teams by serious injuries suffered',
        countLastingInjuriesSufferedByTeam:
          'Teams by lasting injuries suffered',
        countDeathsSufferedByTeam: 'Teams by deaths suffered',
        countTrophiesByTeam: 'Teams by trophies won',
      },
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.teamLink,
      // No team toplist's context depends on its scope, so the second
      // (scope) parameter the hook now supplies is deliberately ignored.
      decorateRows: (rows) => this.decorateTeamRows(rows),
      formatRow: (row) => this.formatTeamRow(row),
    });
  }

  /**
   * No team toplist is scoped to a single race or coach, so every one of them
   * shows both.
   */
  private decorateTeamRows(rows: TeamToplistRow[]): Promise<TeamToplistRow[]> {
    return this.teamContext.attachSuffixes(rows, (row) => row.teamId, {
      includeRace: true,
      includeCoach: true,
    });
  }

  private formatTeamRow(row: TeamToplistRow & { rank: number }): string {
    return `${row.rank}. ${row.name}${row.contextSuffix ?? ''} — ${row.count}`;
  }

  resolveTouchdownsScored(scope: FactScope) {
    return this.resolvers.countTouchdownsScoredByTeam(this.teams, scope);
  }

  resolveCompletions(scope: FactScope) {
    return this.resolvers.countCompletionsByTeam(this.teams, scope);
  }

  resolveInterceptions(scope: FactScope) {
    return this.resolvers.countInterceptionsByTeam(this.teams, scope);
  }

  resolveDeflections(scope: FactScope) {
    return this.resolvers.countDeflectionsByTeam(this.teams, scope);
  }

  resolveCasualtiesCaused(scope: FactScope) {
    return this.resolvers.countCasualtiesCausedByTeam(this.teams, scope);
  }

  resolveSeriousInjuriesCaused(scope: FactScope) {
    return this.resolvers.countSeriousInjuriesCausedByTeam(this.teams, scope);
  }

  resolveDeathsCaused(scope: FactScope) {
    return this.resolvers.countDeathsCausedByTeam(this.teams, scope);
  }

  resolveFoulsCommitted(scope: FactScope) {
    return this.resolvers.countFoulsCommittedByTeam(this.teams, scope);
  }

  resolveTimesSentOff(scope: FactScope) {
    return this.resolvers.countTimesSentOffByTeam(this.teams, scope);
  }

  resolveCasualtiesSuffered(scope: FactScope) {
    return this.resolvers.countCasualtiesSufferedByTeam(this.teams, scope);
  }

  resolveSeriousInjuriesSuffered(scope: FactScope) {
    return this.resolvers.countSeriousInjuriesSufferedByTeam(this.teams, scope);
  }

  resolveLastingInjuriesSuffered(scope: FactScope) {
    return this.resolvers.countLastingInjuriesSufferedByTeam(this.teams, scope);
  }

  resolveDeathsSuffered(scope: FactScope) {
    return this.resolvers.countDeathsSufferedByTeam(this.teams, scope);
  }

  resolveTrophiesWon(scope: FactScope) {
    return this.resolvers.countTrophiesByTeam(this.teams, scope);
  }

  /**
   * The three toplists below take a narrower scope than the table above
   * allows (matches played and competitions played are era-scoped only; eras
   * active is unscoped), so they stay hand-written rather than widening their
   * public signatures to accept a competitionId they would ignore.
   */
  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<TeamToplistRow>({
      title: 'Teams by matches played',
      fetchRows: async (limit) =>
        this.decorateTeamRows(
          await this.teams.countMatchesPlayedByTeam(scope, limit),
        ),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.teamLink,
      formatRow: (row) => this.formatTeamRow(row),
    });
  }

  /**
   * The three match-outcome toplists differ only in title and backing count,
   * so they share one private builder rather than repeating the same
   * resolveToplist call three times. Same precedent as
   * CoachToplistService.resolveGapToplist. They stay hand-written (rather than
   * joining the toplist factory) to sit next to resolveMatchesPlayed, whose
   * league/era/category-only scope they share.
   */
  private resolveMatchOutcomeToplist(options: {
    title: string;
    fetchRows: (limit: number) => Promise<TeamToplistRow[]>;
  }): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<TeamToplistRow>({
      title: options.title,
      fetchRows: async (limit) =>
        this.decorateTeamRows(await options.fetchRows(limit)),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.teamLink,
      formatRow: (row) => this.formatTeamRow(row),
    });
  }

  resolveMatchesWon(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveMatchOutcomeToplist({
      title: 'Teams by matches won',
      fetchRows: (limit) => this.teams.countMatchesWonByTeam(scope, limit),
    });
  }

  resolveMatchesLost(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveMatchOutcomeToplist({
      title: 'Teams by matches lost',
      fetchRows: (limit) => this.teams.countMatchesLostByTeam(scope, limit),
    });
  }

  resolveMatchesDrawn(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveMatchOutcomeToplist({
      title: 'Teams by matches drawn',
      fetchRows: (limit) => this.teams.countMatchesDrawnByTeam(scope, limit),
    });
  }

  resolveCompetitionsPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<TeamToplistRow>({
      title: 'Teams by competitions played',
      fetchRows: async (limit) =>
        this.decorateTeamRows(
          await this.teams.countCompetitionsByTeam(scope, limit),
        ),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.teamLink,
      formatRow: (row) => this.formatTeamRow(row),
    });
  }

  resolveErasActive(): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<TeamToplistRow>({
      title: 'Teams by eras active',
      fetchRows: async (limit) =>
        this.decorateTeamRows(await this.teams.countErasByTeam(limit)),
      timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.teamLink,
      formatRow: (row) => this.formatTeamRow(row),
    });
  }
}
