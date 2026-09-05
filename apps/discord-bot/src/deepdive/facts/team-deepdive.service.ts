import type { TeamHonor, TeamTopPlayer } from '@blood-bowl-tracker/game-data';
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
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PlayerRowButtonService } from '../player-row-button.service';

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
type TopPlayer = TeamTopPlayer & { contextSuffix?: string };

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
 * Composes the team header (race + coach + eras), career span, honors (its own
 * trophies and its players' trophies), and top-players list into a single
 * embed. Shared by `/deepdive team:<id>` and the team deepdive buttons. Each
 * DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so a
 * timeout is distinguishable from a genuine "not found" / "no matches"
 * (`undefined`).
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
    private readonly playerRowButton: PlayerRowButtonService,
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
      this.teams.getTopPlayersByTotalSpp(teamId, MAX_LEADERBOARD_ENTRIES),
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
    const playerHonors = honors.filter((honor) => this.isPlayerHonor(honor));
    let honorSuffixes = new Map<number, string>();
    if (playerHonors.length > 0) {
      const decoratedHonors = await this.databaseTimeout.run(
        this.playerContext.attachSuffixes(
          playerHonors,
          (honor) => honor.playerId,
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
        decoratedHonors.map((honor) => [honor.playerId, honor.contextSuffix]),
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

    // No placeholder when the team has no trophies — the section is simply
    // absent, rather than reported empty. This also covers the case where the
    // list query raced a deletion and came back empty against a stale
    // nonzero total: there is nothing to head a section with either way.
    const honorLines =
      honors.length === 0
        ? []
        : this.eraSectionGrouper
            .group(honors)
            .flatMap((section, index) => [
              ...(index === 0 ? [] : ['']),
              `${section.eraName} trophies:`,
              ...section.rows.map((honor) =>
                this.formatHonor(honor, honorSuffixes),
              ),
            ]);
    // `honorsTotal` is the real number of honors, so this remainder is exact
    // rather than "at least one more". Using `honors.length` (rather than
    // `MAX_TEAM_HONORS`) keeps it self-maintaining if the query's returned row
    // count ever changes. Gated on `honors.length > 0` too: with no section
    // to append it to, an overflow note would have nothing to attach to.
    const honorsTruncatedCount = honorsTotal - honors.length;
    if (honors.length > 0 && honorsTruncatedCount > 0) {
      honorLines.push(`…and ${honorsTruncatedCount} more not shown.`);
    }

    // Honors entries first, then leaderboard entries: buildEntityComponents
    // has no internal prioritisation (first-N / first-group wins), and the
    // honors are the most specific content on the embed.
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents([
        ...honors.flatMap((honor) => this.buildHonorEntries(honor)),
        ...ranked.map((row) =>
          this.playerRowButton.buildPlayerRowButton({
            playerId: row.playerId,
            playerName: row.name,
            positionId: row.positionId,
            positionName: row.positionName,
            isStarPlayer: row.isStarPlayer,
          }),
        ),
        ...headerEntries,
      ]);

    const description = [
      ...header,
      `Career: ${span.start} – ${span.end}`,
      ...(honorLines.length === 0 ? [] : ['', ...honorLines]),
      '',
      'Top players by SPP:',
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
   * Leads with the competition, mirroring `TrophyDeepdiveService.formatRecipient`,
   * with the trophy named alongside it in parentheses since — unlike that
   * service, where the trophy is fixed for the whole embed — one team can
   * hold many different trophies. The team itself is never named: every row
   * is already scoped to the one team this embed is about. A team honor is
   * therefore just `<competition> (<trophy>)`; a player honor adds `: <player>`
   * with their position appended, since the player is the one thing that
   * varies row to row within this team.
   */
  private formatHonor(honor: TeamHonor, suffixes: Map<number, string>): string {
    return this.isPlayerHonor(honor)
      ? `${honor.competitionName} (${honor.trophyName}): ${honor.playerName}${suffixes.get(honor.playerId) ?? ''}`
      : `${honor.competitionName} (${honor.trophyName})`;
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
    return this.isPlayerHonor(honor)
      ? [
          trophyEntry,
          this.playerRowButton.buildPlayerRowButton({
            playerId: honor.playerId,
            playerName: honor.playerName,
            positionId: honor.playerPositionId,
            positionName: honor.playerPositionName,
            isStarPlayer: honor.playerIsStarPlayer,
          }),
        ]
      : [trophyEntry];
  }

  /**
   * Narrows a `TeamHonor` to its player-award shape. Checks `playerId`,
   * `playerName`, `playerPositionId`, `playerPositionName` and
   * `playerIsStarPlayer` together (rather than any one alone) so the filter,
   * the suffix lookup, and the two formatters above all agree on what counts
   * as a player honor — `players.name` and `players.position_id` are both
   * `NOT NULL` in the schema, so a present player always has a present name
   * and position and these fields can never actually disagree, but a single
   * shared predicate keeps that invariant enforced in one place instead of
   * asserted at each call site.
   */
  private isPlayerHonor(honor: TeamHonor): honor is TeamHonor & {
    playerId: number;
    playerName: string;
    playerPositionId: number;
    playerPositionName: string;
    playerIsStarPlayer: boolean;
  } {
    return (
      honor.playerId !== null &&
      honor.playerName !== null &&
      honor.playerPositionId !== null &&
      honor.playerPositionName !== null &&
      honor.playerIsStarPlayer !== null
    );
  }
}
