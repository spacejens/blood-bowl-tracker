import type { FactScope } from '@blood-bowl-tracker/game-data';
import { CoachesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DayCountFormatterService } from '../day-count-formatter.service';
import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import type { ToplistResolver } from './toplist-factory.service';
import { ToplistFactoryService } from './toplist-factory.service';

type CoachToplistMethod =
  | 'countFoulsCommittedByCoach'
  | 'countMatchesPlayedByCoach'
  | 'countMatchesWonByCoach'
  | 'countMatchesLostByCoach'
  | 'countMatchesDrawnByCoach'
  | 'countTeamsByCoach'
  | 'countCompetitionsByCoach';

interface CoachCountRow {
  coachId: number;
  name: string;
  count: number;
}

@Injectable()
export class CoachToplistService {
  private readonly resolvers: Record<
    CoachToplistMethod,
    ToplistResolver<CoachesService>
  >;

  private readonly coachLink: EntityLink<{ coachId: number }> = {
    customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { coachId: number }) => row.coachId,
  };

  constructor(
    private readonly coaches: CoachesService,
    private readonly leaderboard: LeaderboardService,
    private readonly dayCount: DayCountFormatterService,
    private readonly toplistFactory: ToplistFactoryService,
  ) {
    this.resolvers = this.toplistFactory.makeResolvers<
      CoachToplistMethod,
      CoachesService,
      { coachId: number; name: string; count: number }
    >({
      titles: {
        countFoulsCommittedByCoach: 'Coaches by fouls committed',
        countMatchesPlayedByCoach: 'Coaches by matches played',
        countMatchesWonByCoach: 'Coaches by matches won',
        countMatchesLostByCoach: 'Coaches by matches lost',
        countMatchesDrawnByCoach: 'Coaches by matches drawn',
        countTeamsByCoach: 'Coaches by teams coached',
        countCompetitionsByCoach: 'Coaches by competitions played',
      },
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.coachLink,
    });
  }

  resolveFoulsCommitted(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countFoulsCommittedByCoach(this.coaches, scope);
  }

  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesPlayedByCoach(this.coaches, scope);
  }

  resolveMatchesWon(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesWonByCoach(this.coaches, scope);
  }

  resolveMatchesLost(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesLostByCoach(this.coaches, scope);
  }

  resolveMatchesDrawn(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesDrawnByCoach(this.coaches, scope);
  }

  resolveTeams(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countTeamsByCoach(this.coaches, scope);
  }

  resolveCompetitionsPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countCompetitionsByCoach(this.coaches, scope);
  }

  /**
   * Backed by `countErasByCoach`, which takes no `FactScope` at all (eras
   * active is inherently unscoped), so it does not fit the factory's
   * `(scope, limit)` shape and stays hand-written rather than widening its
   * query signature to accept a scope it would ignore.
   */
  resolveErasActive(): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<{
      coachId: number;
      name: string;
      count: number;
    }>({
      title: 'Coaches by eras active',
      fetchRows: (limit) => this.coaches.countErasByCoach(limit),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.coachLink,
    });
  }

  /**
   * The three time-between-matches toplists are hand-written rather than
   * built by the toplist factory because each row renders as a duration
   * ("91 days") instead of a bare count, and the factory applies a single
   * formatRow across a whole titles table, which the count-rendered coach
   * toplists already occupy. Same precedent as
   * ExpensiveMistakesToplistService's `gp` rendering.
   */
  private resolveGapToplist(options: {
    title: string;
    fetchRows: (limit: number) => Promise<CoachCountRow[]>;
  }): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<CoachCountRow>({
      title: options.title,
      fetchRows: options.fetchRows,
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.coachLink,
      formatRow: (row) =>
        `${row.rank}. ${row.name} — ${this.dayCount.format(row.count)}`,
    });
  }

  resolveTimeBetweenMatchesDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveGapToplist({
      title: 'Coaches by longest time between matches (descending)',
      fetchRows: (limit) =>
        this.coaches.getGapBetweenMatchesByCoachDescending(scope, limit),
    });
  }

  /**
   * Ranks the same single-longest-gap metric ascending: the coaches whose
   * worst gap is smallest, i.e. the most consistently active ones.
   */
  resolveTimeBetweenMatchesAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveGapToplist({
      title: 'Coaches by longest time between matches (ascending)',
      fetchRows: (limit) =>
        this.coaches.getGapBetweenMatchesByCoachAscending(scope, limit),
    });
  }

  resolveAverageTimeBetweenMatches(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveGapToplist({
      title: 'Coaches by average time between matches',
      fetchRows: (limit) =>
        this.coaches.getAverageGapBetweenMatchesByCoach(scope, limit),
    });
  }
}
