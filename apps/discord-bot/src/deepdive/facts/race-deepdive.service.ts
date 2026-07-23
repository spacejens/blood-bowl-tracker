import type { RacesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  LeaderboardService,
  MAX_LEADERBOARD_ENTRIES,
} from '../../insights/leaderboard.service';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type Race = { id: number; name: string };
type Era = { id: number; name: string };
type TopTeam = { id: number; name: string; count: number };

/** Position at which the top-teams list opens a tie group (5th place). */
const TOP_TEAMS_TOP_ENTRIES = 5;

/**
 * Composes the race header, the eras it has appeared in, and its top-teams list
 * into a single embed. Shared by `/deepdive race:<id>` and the race deepdive
 * buttons. Each DB call is wrapped in `databaseTimeout.run` with a `null`
 * sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`). The top-teams query is not era-scoped, matching the coach
 * precedent (the deepdive command takes no era argument).
 */
@Injectable()
export class RaceDeepdiveService {
  constructor(
    private readonly races: RacesService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  async resolve(raceId: number): Promise<string | InteractionReplyOptions> {
    const race: Race | undefined | null = await this.databaseTimeout.run(
      this.races.findById(raceId),
      null,
    );
    if (race === null) {
      return DEEPDIVE_RACE_TIMEOUT_MESSAGE;
    }
    if (race === undefined) {
      return DEEPDIVE_RACE_NOT_FOUND_MESSAGE;
    }

    const eraRows: Era[] | null = await this.databaseTimeout.run(
      this.races.listEras(raceId),
      null,
    );
    if (eraRows === null) {
      return DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE;
    }

    const topTeams: TopTeam[] | null = await this.databaseTimeout.run(
      this.races.getTopTeamsByMatchesPlayed(raceId, MAX_LEADERBOARD_ENTRIES),
      null,
    );
    if (topTeams === null) {
      return DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE;
    }

    const eras =
      eraRows.length > 0
        ? eraRows.map((era) => era.name).join(', ')
        : 'None recorded';

    const { rows: ranked, truncatedCount } = this.leaderboard.topRanksWithTies(
      topTeams,
      TOP_TEAMS_TOP_ENTRIES,
    );
    const teamLines =
      ranked.length === 0
        ? [DEEPDIVE_RACE_NO_TEAMS_MESSAGE]
        : ranked.map((row) => `${row.rank}. ${row.name} — ${row.count}`);
    if (truncatedCount > 0) {
      teamLines.push(`…and ${truncatedCount} more tied.`);
    }

    const description = [
      `Eras: ${eras}`,
      '',
      'Top teams by matches played:',
      ...teamLines,
    ].join('\n');

    type ButtonEntry = { customId: string; label: string };
    const buttonEntries: ButtonEntry[] = [
      ...eraRows.map((era) => ({
        customId: `${ERA_BUTTON_CUSTOM_ID_PREFIX}${era.id}`,
        label: era.name,
      })),
      ...ranked.map((team) => ({
        customId: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${team.id}`,
        label: team.name,
      })),
    ];
    const components = this.leaderboard.buildEntityButtons(
      buttonEntries,
      (entry) => entry.customId,
      (entry) => entry.label,
    );

    return {
      embeds: [{ title: race.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }
}
