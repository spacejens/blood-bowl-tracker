import type { CoachesService, FactScope } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';

@Injectable()
export class CoachToplistService {
  constructor(
    private readonly coaches: CoachesService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  private coachButtonId(row: { coachId: number }): string {
    return `${COACH_BUTTON_CUSTOM_ID_PREFIX}${row.coachId}`;
  }

  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Coaches by matches played',
      fetchRows: () => this.coaches.countMatchesPlayedByCoach(scope),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
    });
  }

  resolveTeams(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Coaches by teams coached',
      fetchRows: () => this.coaches.countTeamsByCoach(scope),
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
      fetchRows: () => this.coaches.countCompetitionsByCoach(scope),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
    });
  }

  resolveErasActive(): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Coaches by eras active',
      fetchRows: () => this.coaches.countErasByCoach(),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.coachButtonId(row),
    });
  }
}
