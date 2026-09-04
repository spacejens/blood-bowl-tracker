import type { RacePositionsInEra } from '@blood-bowl-tracker/game-data';
import { RacesService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_POSITIONS_TIMEOUT_MESSAGE,
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
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
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

    const positionsByEra: RacePositionsInEra[] | null =
      await this.databaseTimeout.run(
        this.races.listPositionsByEra(raceId),
        null,
      );
    if (positionsByEra === null) {
      return DEEPDIVE_RACE_POSITIONS_TIMEOUT_MESSAGE;
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

    // No placeholder when a race has no positions recorded: the section is
    // simply absent rather than reported empty. The plain-text `Eras:` line
    // above is unaffected — it stays the race's summary line, while this
    // section answers what the race could actually field in each era.
    const positionLines =
      positionsByEra.length === 0
        ? []
        : [
            '',
            'Positions:',
            ...positionsByEra.map(
              (era) =>
                `${era.eraName}: ${era.positions.map((position) => position.name).join(' ')}`,
            ),
          ];

    // Leaderboard entries first: buildEntityComponents has no internal
    // prioritisation (first-N / first-group wins), so the top-teams list gets
    // drill-down controls before the era header entries do.
    const entries: EntityComponentEntry[] = [
      ...ranked.map((team): EntityComponentEntry => ({
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(team.id),
        label: team.name,
      })),
      ...eraRows.map((era): EntityComponentEntry => ({
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(era.id),
        label: era.name,
      })),
      ...positionsByEra.flatMap((era) =>
        era.positions.map((position): EntityComponentEntry => ({
          customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(position.id),
          label: position.name,
        })),
      ),
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);

    const description = [
      `Eras: ${eras}`,
      ...positionLines,
      '',
      'Top teams by matches played:',
      ...teamLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(RACE_BUTTON_CUSTOM_ID_PREFIX)} ${race.name}`,
          description: this.enforceDescriptionLimit(description),
        },
      ],
      ...(components.length > 0 ? { components } : {}),
    };
  }

  /**
   * Absolute safety net for Discord's embed description limit.
   * `listPositionsByEra` has no row cap of its own — a race with many eras
   * and many positions per era, or simply long position names, could in
   * principle overflow — so this measures the actual assembled string rather
   * than trusting that input to stay small. Mirrors
   * `PlayerDeepdiveService.enforceDescriptionLimit`.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}
