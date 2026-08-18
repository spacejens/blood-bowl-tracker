import type { PlayerHonor } from '@blood-bowl-tracker/game-data';
import {
  PlayersService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type Player = {
  id: number;
  name: string;
  teamName: string;
  teamId: number;
  raceName: string;
  raceId: number;
  positionName: string;
  eraName: string;
  eraId: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
};
type CategoryCount = { label: string; count: number };

/**
 * Most honors listed in one player embed. Deliberately its own constant rather
 * than a shared import of `MAX_TEAM_HONORS`: the two facts start at the same
 * value but are free to drift apart. The list query fetches exactly this many
 * rows; the true total comes from `countByPlayer`, so the overflow note
 * reports an exact remainder.
 */
const MAX_PLAYER_HONORS = 30;

/**
 * Composes the player header (team, era, race, position) and per-category event
 * counts into a single embed. Shared by `/deepdive player:<id>` and the player
 * deepdive buttons. Each DB call is wrapped in `databaseTimeout.run` with a
 * `null` sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`). Only non-zero categories are listed; an all-zero player shows
 * a short placeholder instead of an empty list. Team, era and race each get a
 * drill-down button, in the same order as the header lines; position has no
 * deepdive target, so it gets none.
 * When the player has a computed `sppTotal`, a trailing section shows any
 * manual adjustment and the total.
 * Between the header and the category counts sits an Honors section listing
 * the trophies this player has personally won, newest competition first,
 * capped at `MAX_PLAYER_HONORS` with an exact "…and N more not shown."
 * remainder. Unlike the team deepdive's equivalent it needs neither era
 * grouping nor a per-row team name — a player belongs to exactly one team-era
 * for their whole career, so the header already names both. The section is
 * omitted entirely when the player has won nothing. Each honor adds a
 * drill-down button to its trophy, ahead of the header buttons.
 */
@Injectable()
export class PlayerDeepdiveService {
  constructor(
    private readonly players: PlayersService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly trophyAwards: TrophyAwardsService,
  ) {}

  async resolve(playerId: number): Promise<string | InteractionReplyOptions> {
    const player: Player | undefined | null = await this.databaseTimeout.run(
      this.players.findById(playerId),
      null,
    );
    if (player === null) {
      return DEEPDIVE_PLAYER_TIMEOUT_MESSAGE;
    }
    if (player === undefined) {
      return DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE;
    }

    const header = [
      `Team: ${player.teamName}`,
      `Era: ${player.eraName}`,
      `Race: ${player.raceName}`,
      `Position: ${player.positionName}`,
    ];

    // Both honors queries share one timeout message: they are two halves of
    // the same "what has this player won?" answer, and telling the reader
    // which of them was slow would not help them.
    const honorsTotal: number | null = await this.databaseTimeout.run(
      this.trophyAwards.countByPlayer(playerId),
      null,
    );
    if (honorsTotal === null) {
      return DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE;
    }

    // A player confirmed to have won nothing has nothing left to list, so skip
    // the list query rather than let an unnecessary timeout there turn a known
    // "no honors" answer into a spurious timeout message.
    let honors: PlayerHonor[] = [];
    if (honorsTotal > 0) {
      const rows: PlayerHonor[] | null = await this.databaseTimeout.run(
        this.trophyAwards.listByPlayer(playerId, MAX_PLAYER_HONORS),
        null,
      );
      if (rows === null) {
        return DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE;
      }
      honors = rows;
    }

    const counts: CategoryCount[] | null = await this.databaseTimeout.run(
      this.players.getDeepdiveCategoryCounts(playerId),
      null,
    );
    if (counts === null) {
      return DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE;
    }

    const nonZero = counts.filter((category) => category.count > 0);
    const categoryLines =
      nonZero.length === 0
        ? [DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE]
        : nonZero.map((category) => `${category.label}: ${category.count}`);

    // No placeholder when the player has no trophies — the section is simply
    // absent, rather than reported empty. This also covers the case where the
    // list query raced a deletion and came back empty against a stale nonzero
    // total: there is no section for an overflow note to attach to either way.
    // Unlike the team deepdive there is no era grouping and no team on the
    // row: a player belongs to exactly one team-era for their whole career,
    // so the embed's own `Team:`/`Era:` header already names both.
    const honorLines = honors.map(
      (honor) => `${honor.competitionName} (${honor.trophyName})`,
    );
    // `honorsTotal` is the real number of honors, so this remainder is exact
    // rather than "at least one more". Using `honors.length` (rather than
    // `MAX_PLAYER_HONORS`) keeps it self-maintaining if the query's returned
    // row count ever changes.
    const honorsTruncatedCount = honorsTotal - honors.length;
    if (honors.length > 0 && honorsTruncatedCount > 0) {
      honorLines.push(`…and ${honorsTruncatedCount} more not shown.`);
    }

    // Honors entries first, then the header entries: buildEntityComponents has
    // no internal prioritisation (first-N / first-group wins), and the honors
    // are the most specific content on the embed. Only the trophy is offered
    // per honor: the player is the embed's own subject, and the team already
    // has a header entry.
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents([
        ...honors.map((honor): EntityComponentEntry => ({
          customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(honor.trophyId),
          label: honor.trophyName,
        })),
        {
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.teamId),
          label: player.teamName,
        },
        {
          customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.eraId),
          label: player.eraName,
        },
        {
          customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.raceId),
          label: player.raceName,
        },
      ]);

    const description = [
      ...header,
      ...(honorLines.length === 0 ? [] : ['', 'Honors:', ...honorLines]),
      '',
      ...categoryLines,
      ...this.buildTotalLines(player),
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(PLAYER_BUTTON_CUSTOM_ID_PREFIX)} ${player.name}`,
          description,
        },
      ],
      components,
    };
  }

  /**
   * The trailing total section: nothing at all when no total has been computed
   * (null), otherwise a blank separator line, an optional adjustment line, and
   * the total. A computed total of 0 is shown — unlike a zero category count,
   * it is a real value rather than an absence. `sppTotal` already includes
   * `sppAdjustment`, so the adjustment line calls that out explicitly rather
   * than leaving a reader to assume the two lines should be summed.
   * `sppAdjustment` is clamped non-negative wherever it's written today
   * (`SppAdjustmentsService`), so the negative-sign branch below is
   * defensive against a future or manually-edited negative value.
   */
  private buildTotalLines(player: Player): string[] {
    if (player.sppTotal === null) {
      return [];
    }
    const adjustment = player.sppAdjustment;
    const adjustmentLines =
      adjustment === null || adjustment === 0
        ? []
        : [
            `Star player points adjustment: ${
              adjustment > 0 ? `+${adjustment}` : String(adjustment)
            } (included)`,
          ];
    return [
      '',
      ...adjustmentLines,
      `Total star player points: ${player.sppTotal}`,
    ];
  }
}
