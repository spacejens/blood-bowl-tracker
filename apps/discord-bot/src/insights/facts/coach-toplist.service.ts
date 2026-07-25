import type { FactScope } from '@blood-bowl-tracker/game-data';
import { CoachesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';
import type { ToplistResolver } from './toplist-factory';
import { makeToplistResolvers } from './toplist-factory';

@Injectable()
export class CoachToplistService {
  /**
   * `resolveMatchesPlayed`, `resolveTeams`, and `resolveCompetitionsPlayed`
   * already have the `(scope, limit) -> counted rows` shape this factory
   * requires and could be migrated onto it too; they're left hand-written for
   * now, with that migration tracked as a follow-up issue (see the "Follow-up"
   * section of `docs/plans/2026-07-25-coach-toplist-fouls-committed-design.md`).
   * Only `resolveErasActive` (backed by `countErasByCoach`, which takes no
   * scope at all) is structurally incompatible with the factory.
   */
  private readonly resolvers: Record<
    'countFoulsCommittedByCoach',
    ToplistResolver<CoachesService>
  >;

  constructor(
    private readonly coaches: CoachesService,
    private readonly leaderboard: LeaderboardService,
  ) {
    this.resolvers = makeToplistResolvers<
      'countFoulsCommittedByCoach',
      CoachesService,
      { coachId: number; name: string; count: number }
    >({
      titles: {
        countFoulsCommittedByCoach: 'Coaches by fouls committed',
      },
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
      leaderboard: this.leaderboard,
    });
  }

  private coachButtonId(row: { coachId: number }): string {
    return `${COACH_BUTTON_CUSTOM_ID_PREFIX}${row.coachId}`;
  }

  resolveFoulsCommitted(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countFoulsCommittedByCoach(this.coaches, scope);
  }

  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Coaches by matches played',
      fetchRows: (limit) =>
        this.coaches.countMatchesPlayedByCoach(scope, limit),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
    });
  }

  resolveTeams(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Coaches by teams coached',
      fetchRows: (limit) => this.coaches.countTeamsByCoach(scope, limit),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
    });
  }

  resolveCompetitionsPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Coaches by competitions played',
      fetchRows: (limit) => this.coaches.countCompetitionsByCoach(scope, limit),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
    });
  }

  resolveErasActive(): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Coaches by eras active',
      fetchRows: (limit) => this.coaches.countErasByCoach(limit),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
    });
  }
}
