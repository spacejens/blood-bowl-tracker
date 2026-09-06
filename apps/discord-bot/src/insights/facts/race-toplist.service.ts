import type { FactScope, RaceTeamCount } from '@blood-bowl-tracker/game-data';
import { RacesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { RACE_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  RACE_TOPLIST_NO_DATA_MESSAGE,
  RACE_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';

@Injectable()
export class RaceToplistService {
  private readonly raceLink: EntityLink<{ raceId: number }> = {
    customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { raceId: number }) => row.raceId,
  };

  constructor(
    private readonly races: RacesService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  /**
   * Every race toplist differs only in title and backing count, so they share
   * one builder rather than repeating the same resolveToplist call six times.
   * Same precedent as CoachToplistService.resolveGapToplist.
   */
  private resolveRaceToplist(options: {
    title: string;
    fetchRows: (limit: number) => Promise<RaceTeamCount[]>;
  }): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<RaceTeamCount>({
      title: options.title,
      fetchRows: options.fetchRows,
      timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.raceLink,
    });
  }

  resolveTeamsDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveRaceToplist({
      title: 'Races by teams (descending)',
      fetchRows: (limit) => this.races.countTeamsByRaceDescending(scope, limit),
    });
  }

  resolveTeamsAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveRaceToplist({
      title: 'Races by teams (ascending)',
      fetchRows: (limit) => this.races.countTeamsByRaceAscending(scope, limit),
    });
  }

  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveRaceToplist({
      title: 'Races by matches played',
      fetchRows: (limit) => this.races.countMatchesPlayedByRace(scope, limit),
    });
  }

  resolveMatchesWon(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveRaceToplist({
      title: 'Races by matches won',
      fetchRows: (limit) => this.races.countMatchesWonByRace(scope, limit),
    });
  }

  resolveMatchesLost(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveRaceToplist({
      title: 'Races by matches lost',
      fetchRows: (limit) => this.races.countMatchesLostByRace(scope, limit),
    });
  }

  resolveMatchesDrawn(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveRaceToplist({
      title: 'Races by matches drawn',
      fetchRows: (limit) => this.races.countMatchesDrawnByRace(scope, limit),
    });
  }
}
