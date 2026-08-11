import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  LeaderboardService,
  MAX_LEADERBOARD_ENTRIES,
} from '../../insights/leaderboard.service';
import { PlayerContextService } from '../../insights/player-context.service';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type Team = {
  id: number;
  name: string;
  raceName: string;
  raceId: number;
  coachName: string;
  coachId: number;
};
type CareerSpan = { start: string; end: string };
type TopPlayer = {
  playerId: number;
  name: string;
  count: number;
  contextSuffix?: string;
};

/** Position at which the top-players list opens a tie group (5th place). */
const TOP_PLAYERS_TOP_ENTRIES = 5;

/**
 * Composes the team header (race + coach), career span, and top-players list
 * into a single embed. Shared by `/deepdive team:<id>` and the team deepdive
 * buttons. Each DB call is wrapped in `databaseTimeout.run` with a `null`
 * sentinel so a timeout is distinguishable from a genuine "not found" / "no
 * matches" (`undefined`).
 */
@Injectable()
export class TeamDeepdiveService {
  constructor(
    private readonly teams: TeamsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
    private readonly entityComponents: EntityComponentsService,
    private readonly playerContext: PlayerContextService,
  ) {}

  async resolve(teamId: number): Promise<string | InteractionReplyOptions> {
    const team: Team | undefined | null = await this.databaseTimeout.run(
      this.teams.findById(teamId),
      null,
    );
    if (team === null) {
      return DEEPDIVE_TEAM_TIMEOUT_MESSAGE;
    }
    if (team === undefined) {
      return DEEPDIVE_TEAM_NOT_FOUND_MESSAGE;
    }

    const header = [`Race: ${team.raceName}`, `Coach: ${team.coachName}`];
    const headerEntries: EntityComponentEntry[] = [
      {
        customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(team.raceId),
        label: team.raceName,
      },
      {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(team.coachId),
        label: team.coachName,
      },
    ];

    const span: CareerSpan | undefined | null = await this.databaseTimeout.run(
      this.teams.getCareerSpan(teamId),
      null,
    );
    if (span === null) {
      return DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE;
    }
    if (span === undefined) {
      const { components } =
        this.entityComponents.buildEntityComponents(headerEntries);
      return {
        embeds: [
          {
            title: team.name,
            description: [...header, DEEPDIVE_TEAM_NO_MATCHES_MESSAGE].join(
              '\n',
            ),
          },
        ],
        components,
      };
    }

    const topPlayers: TopPlayer[] | null = await this.databaseTimeout.run(
      this.teams.getTopPlayersByMatchEventCount(
        teamId,
        MAX_LEADERBOARD_ENTRIES,
      ),
      null,
    );
    if (topPlayers === null) {
      return DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE;
    }

    // The list is already scoped to this one team, whose race and coach the
    // header states, so only the position and era add information. Wrapped in
    // the same timeout handling as every other DB call in this method, since
    // attachSuffixes does its own DB round trip.
    const decoratedPlayers: TopPlayer[] | null = await this.databaseTimeout.run(
      this.playerContext.attachSuffixes(topPlayers, (row) => row.playerId, {
        includePosition: true,
        includeTeam: false,
        includeRace: false,
        includeEra: true,
        includeCoach: false,
      }),
      null,
    );
    if (decoratedPlayers === null) {
      return DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE;
    }

    const { rows: ranked, truncatedCount } = this.leaderboard.topRanksWithTies(
      decoratedPlayers,
      TOP_PLAYERS_TOP_ENTRIES,
    );
    const playerLines = ranked.map(
      (row) =>
        `${row.rank}. ${row.name}${row.contextSuffix ?? ''} — ${row.count}`,
    );
    if (truncatedCount > 0) {
      playerLines.push(`…and ${truncatedCount} more tied.`);
    }

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents([
        ...headerEntries,
        ...ranked.map((row): EntityComponentEntry => ({
          customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(row.playerId),
          label: row.name,
        })),
      ]);

    const description = [
      ...header,
      `Career: ${span.start} – ${span.end}`,
      '',
      'Top players by match events:',
      ...playerLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [{ title: team.name, description }],
      components,
    };
  }
}
