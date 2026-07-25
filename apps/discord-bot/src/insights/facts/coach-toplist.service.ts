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

type CoachToplistMethod =
  | 'countFoulsCommittedByCoach'
  | 'countMatchesPlayedByCoach'
  | 'countTeamsByCoach'
  | 'countCompetitionsByCoach';

@Injectable()
export class CoachToplistService {
  private readonly resolvers: Record<
    CoachToplistMethod,
    ToplistResolver<CoachesService>
  >;

  constructor(
    private readonly coaches: CoachesService,
    private readonly leaderboard: LeaderboardService,
  ) {
    this.resolvers = makeToplistResolvers<
      CoachToplistMethod,
      CoachesService,
      { coachId: number; name: string; count: number }
    >({
      titles: {
        countFoulsCommittedByCoach: 'Coaches by fouls committed',
        countMatchesPlayedByCoach: 'Coaches by matches played',
        countTeamsByCoach: 'Coaches by teams coached',
        countCompetitionsByCoach: 'Coaches by competitions played',
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

  resolveFoulsCommitted(scope: FactScope) {
    return this.resolvers.countFoulsCommittedByCoach(this.coaches, scope);
  }

  resolveMatchesPlayed(scope: FactScope) {
    return this.resolvers.countMatchesPlayedByCoach(this.coaches, scope);
  }

  resolveTeams(scope: FactScope) {
    return this.resolvers.countTeamsByCoach(this.coaches, scope);
  }

  resolveCompetitionsPlayed(scope: FactScope) {
    return this.resolvers.countCompetitionsByCoach(this.coaches, scope);
  }

  /**
   * Backed by `countErasByCoach`, which takes no `FactScope` at all (eras
   * active is inherently unscoped), so it does not fit the factory's
   * `(scope, limit)` shape and stays hand-written rather than widening its
   * query signature to accept a scope it would ignore.
   */
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
