import type { TeamHonor } from '@blood-bowl-tracker/game-data';
import {
  TeamsService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_HONORS_TIMEOUT_MESSAGE,
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
import { EraSectionGrouperService } from '../../shared/era-section-grouper.service';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
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
type Era = { id: number; name: string };
type TopPlayer = {
  playerId: number;
  name: string;
  count: number;
  contextSuffix?: string;
};

/** Position at which the top-players list opens a tie group (5th place). */
const TOP_PLAYERS_TOP_ENTRIES = 5;

/**
 * Most honors listed in one team embed. Deliberately its own constant rather
 * than a shared import of `MAX_TROPHY_RECIPIENTS`: the two facts start at the
 * same value but are free to drift apart. The list query fetches exactly this
 * many rows; the true total comes from `countByTeam`, so the overflow note
 * reports an exact remainder.
 */
const MAX_TEAM_HONORS = 30;

/**
 * Composes the team header (race + coach + eras), career span, and top-players
 * list into a single embed. Shared by `/deepdive team:<id>` and the team
 * deepdive buttons. Each DB call is wrapped in `databaseTimeout.run` with a
 * `null` sentinel so a timeout is distinguishable from a genuine "not found" /
 * "no matches" (`undefined`).
 */
@Injectable()
export class TeamDeepdiveService {
  constructor(
    private readonly teams: TeamsService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
    private readonly entityComponents: EntityComponentsService,
    private readonly playerContext: PlayerContextService,
    private readonly trophyAwards: TrophyAwardsService,
    private readonly eraSectionGrouper: EraSectionGrouperService,
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

    const eraRows: Era[] | null = await this.databaseTimeout.run(
      this.teams.listEras(teamId),
      null,
    );
    if (eraRows === null) {
      return DEEPDIVE_TEAM_ERAS_TIMEOUT_MESSAGE;
    }
    const eraNames =
      eraRows.length > 0
        ? eraRows.map((era) => era.name).join(', ')
        : 'None recorded';

    const header = [
      `Race: ${team.raceName}`,
      `Coach: ${team.coachName}`,
      `Eras: ${eraNames}`,
    ];
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
      ...eraRows.map((era): EntityComponentEntry => ({
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(era.id),
        label: era.name,
      })),
    ];

    const span: CareerSpan | undefined | null = await this.databaseTimeout.run(
      this.teams.getCareerSpan(teamId),
      null,
    );
    if (span === null) {
      return DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE;
    }
    if (span === undefined) {
      const { components, overflowNote } =
        this.entityComponents.buildEntityComponents(headerEntries);
      return {
        embeds: [
          {
            title: `${this.entityComponents.getEmojiForPrefix(TEAM_BUTTON_CUSTOM_ID_PREFIX)} ${team.name}`,
            description: [
              ...header,
              DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
              ...(overflowNote === null ? [] : [overflowNote]),
            ].join('\n'),
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

    // Both honors queries share one timeout message: they are two halves of
    // the same "what has this team won?" answer, and telling the reader which
    // of them was slow would not help them.
    const honorsTotal: number | null = await this.databaseTimeout.run(
      this.trophyAwards.countByTeam(teamId),
      null,
    );
    if (honorsTotal === null) {
      return DEEPDIVE_TEAM_HONORS_TIMEOUT_MESSAGE;
    }

    // A team confirmed to have won nothing has nothing left to list, so skip
    // the list query rather than let an unnecessary timeout there turn a known
    // "no honors" answer into a spurious timeout message.
    let honors: TeamHonor[] = [];
    if (honorsTotal > 0) {
      const rows: TeamHonor[] | null = await this.databaseTimeout.run(
        this.trophyAwards.listByTeam(teamId, MAX_TEAM_HONORS),
        null,
      );
      if (rows === null) {
        return DEEPDIVE_TEAM_HONORS_TIMEOUT_MESSAGE;
      }
      honors = rows;
    }

    // Only player honors carry a suffix, and only the position adds anything:
    // the team, its race and its coach are the embed's own header, and the era
    // is named by the section heading this row sits under. Skipped entirely
    // when no honor is a player award, for the same reason the list query is.
    const playerHonors = honors.filter((honor) => honor.playerId !== null);
    let honorSuffixes = new Map<number, string>();
    if (playerHonors.length > 0) {
      const decoratedHonors = await this.databaseTimeout.run(
        this.playerContext.attachSuffixes(
          playerHonors,
          (honor) => honor.playerId as number,
          {
            includePosition: true,
            includeTeam: false,
            includeRace: false,
            includeEra: false,
            includeCoach: false,
          },
        ),
        null,
      );
      if (decoratedHonors === null) {
        return DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE;
      }
      honorSuffixes = new Map(
        decoratedHonors.map((honor) => [
          honor.playerId as number,
          honor.contextSuffix,
        ]),
      );
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

    const honorLines =
      honorsTotal === 0
        ? ['Honors: None recorded']
        : [
            'Honors:',
            ...this.eraSectionGrouper
              .group(honors)
              .flatMap((section, index) => [
                ...(index === 0 ? [] : ['']),
                `${section.eraName} recipients:`,
                ...section.rows.map((honor) =>
                  this.formatHonor(honor, team.name, honorSuffixes),
                ),
              ]),
          ];
    // `honorsTotal` is the real number of honors, so this remainder is exact
    // rather than "at least one more". Using `honors.length` (rather than
    // `MAX_TEAM_HONORS`) keeps it self-maintaining if the query's returned row
    // count ever changes.
    const honorsTruncatedCount = honorsTotal - honors.length;
    if (honorsTruncatedCount > 0) {
      honorLines.push(`…and ${honorsTruncatedCount} more not shown.`);
    }

    // Honors entries first, then leaderboard entries: buildEntityComponents
    // has no internal prioritisation (first-N / first-group wins), and the
    // honors are the most specific content on the embed.
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents([
        ...honors.flatMap((honor) => this.buildHonorEntries(honor)),
        ...ranked.map((row): EntityComponentEntry => ({
          customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(row.playerId),
          label: row.name,
        })),
        ...headerEntries,
      ]);

    const description = [
      ...header,
      `Career: ${span.start} – ${span.end}`,
      '',
      ...honorLines,
      '',
      'Top players by match events:',
      ...playerLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(TEAM_BUTTON_CUSTOM_ID_PREFIX)} ${team.name}`,
          description,
        },
      ],
      components,
    };
  }

  /**
   * A team honor names the team that holds it; a player honor names the
   * player, with their position appended. Inverted from
   * `TrophyDeepdiveService.formatRecipient`, where the competition names the
   * recipient: here the trophy is the varying part, since one team can hold
   * many different trophies.
   */
  private formatHonor(
    honor: TeamHonor,
    teamName: string,
    suffixes: Map<number, string>,
  ): string {
    return honor.playerId === null || honor.playerName === null
      ? `${honor.trophyName}: ${teamName}`
      : `${honor.trophyName}: ${honor.playerName}${suffixes.get(honor.playerId) ?? ''}`;
  }

  /**
   * Drill down to the trophy itself, and — for a player honor — to the player
   * who won it. The team is not offered: it is the embed's own subject.
   */
  private buildHonorEntries(honor: TeamHonor): EntityComponentEntry[] {
    const trophyEntry: EntityComponentEntry = {
      customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
      entityId: String(honor.trophyId),
      label: honor.trophyName,
    };
    return honor.playerId === null || honor.playerName === null
      ? [trophyEntry]
      : [
          trophyEntry,
          {
            customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
            entityId: String(honor.playerId),
            label: honor.playerName,
          },
        ];
  }
}
