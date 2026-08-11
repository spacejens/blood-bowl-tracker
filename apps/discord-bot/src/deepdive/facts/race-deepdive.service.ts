import { RacesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_TEAM_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  LeaderboardService,
  MAX_LEADERBOARD_ENTRIES,
} from '../../insights/leaderboard.service';
import { TeamContextService } from '../../insights/team-context.service';
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
    private readonly entityComponents: EntityComponentsService,
    private readonly teamContext: TeamContextService,
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
    // The list is already scoped to this one race, so only the coach adds
    // information; the race half would repeat on every row. Wrapped in the
    // same timeout handling as every other DB call in this method, since
    // attachSuffixes does its own DB round trip.
    const decorated:
      (TopTeam & { rank: number; contextSuffix: string })[] | null =
      await this.databaseTimeout.run(
        this.teamContext.attachSuffixes(ranked, (row) => row.id, {
          includeRace: false,
          includeCoach: true,
        }),
        null,
      );
    if (decorated === null) {
      return DEEPDIVE_RACE_TEAM_CONTEXT_TIMEOUT_MESSAGE;
    }
    const teamLines =
      decorated.length === 0
        ? [DEEPDIVE_RACE_NO_TEAMS_MESSAGE]
        : decorated.map(
            (row) =>
              `${row.rank}. ${row.name}${row.contextSuffix} — ${row.count}`,
          );
    if (truncatedCount > 0) {
      teamLines.push(`…and ${truncatedCount} more tied.`);
    }

    const entries: EntityComponentEntry[] = [
      ...eraRows.map((era): EntityComponentEntry => ({
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(era.id),
        label: era.name,
      })),
      ...ranked.map((team): EntityComponentEntry => ({
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(team.id),
        label: team.name,
      })),
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);

    const description = [
      `Eras: ${eras}`,
      '',
      'Top teams by matches played:',
      ...teamLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [{ title: race.name, description }],
      ...(components.length > 0 ? { components } : {}),
    };
  }
}
