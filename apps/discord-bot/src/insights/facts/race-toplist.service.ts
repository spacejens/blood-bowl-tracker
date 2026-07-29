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
  private readonly raceLink = {
    customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { raceId: number }) => row.raceId,
  };

  constructor(
    private readonly races: RacesService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  resolveTeams(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<{
      raceId: number;
      name: string;
      count: number;
    }>({
      title: 'Races by teams',
      fetchRows: (limit) => this.races.countTeamsByRace(scope, limit),
      timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.raceLink,
    });
  }

  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<{
      raceId: number;
      name: string;
      count: number;
    }>({
      title: 'Races by matches played',
      fetchRows: (limit) => this.races.countMatchesPlayedByRace(scope, limit),
      timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.raceLink,
    });
  }

  /**
   * The three match-outcome toplists differ only in title and backing count,
   * so they share one private builder rather than repeating the same
   * resolveToplist call three times. Same precedent as
   * CoachToplistService.resolveGapToplist.
   */
  private resolveMatchOutcomeToplist(options: {
    title: string;
    fetchRows: (
      limit: number,
    ) => Promise<{ raceId: number; name: string; count: number }[]>;
  }): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<{
      raceId: number;
      name: string;
      count: number;
    }>({
      title: options.title,
      fetchRows: options.fetchRows,
      timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.raceLink,
    });
  }

  resolveMatchesWon(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveMatchOutcomeToplist({
      title: 'Races by matches won',
      fetchRows: (limit) => this.races.countMatchesWonByRace(scope, limit),
    });
  }

  resolveMatchesLost(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveMatchOutcomeToplist({
      title: 'Races by matches lost',
      fetchRows: (limit) => this.races.countMatchesLostByRace(scope, limit),
    });
  }

  resolveMatchesDrawn(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveMatchOutcomeToplist({
      title: 'Races by matches drawn',
      fetchRows: (limit) => this.races.countMatchesDrawnByRace(scope, limit),
    });
  }
}
