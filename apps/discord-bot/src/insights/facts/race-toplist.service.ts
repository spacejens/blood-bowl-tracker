import type { FactScope } from '@blood-bowl-tracker/game-data';
import { RacesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { RACE_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  RACE_TOPLIST_NO_DATA_MESSAGE,
  RACE_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';

@Injectable()
export class RaceToplistService {
  constructor(
    private readonly races: RacesService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  private raceButtonId(row: { raceId: number }): string {
    return `${RACE_BUTTON_CUSTOM_ID_PREFIX}${row.raceId}`;
  }

  resolveTeams(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Races by teams',
      fetchRows: () => this.races.countTeamsByRace(scope),
      timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.raceButtonId(row),
    });
  }

  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist({
      title: 'Races by matches played',
      fetchRows: () => this.races.countMatchesPlayedByRace(scope),
      timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.raceButtonId(row),
    });
  }
}
