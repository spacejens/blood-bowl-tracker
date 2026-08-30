import type {
  FactScope,
  OnThisDateKilledPlayer,
} from '@blood-bowl-tracker/game-data';
import { OnThisDateService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { PlayerKillerInfoFormatterService } from '../../deepdive/facts/player-killer-info-formatter.service';
import { PlayerRowButtonService } from '../../deepdive/player-row-button.service';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  ON_THIS_DATE_NO_EVENTS_MESSAGE,
  ON_THIS_DATE_NO_MATCHES_MESSAGE,
  ON_THIS_DATE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { EventCountLinesService } from '../../shared/event-count-lines.service';
import type { MonthDay } from '../../shared/month-day.service';
import { MonthDayService } from '../../shared/month-day.service';
import {
  MAX_LEADERBOARD_ENTRIES,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';

/**
 * The leaderboard's own show-at-least-this-many-by-position cutoff, repeated
 * here because `LeaderboardService` keeps it private to `resolveToplist` -
 * which this fact cannot use, since its rows are a victim paired with a
 * killer rather than a name and a count.
 */
const MAX_TOP_ENTRIES = 5;

type RankedVictim = OnThisDateKilledPlayer & { count: number; rank: number };

/**
 * Renders the "on this date" insight: every match played on a given
 * month/day across history (or within the caller's scope), the counter block
 * of what happened, and any famous deaths with their killers.
 *
 * Lives under `insights/facts/` rather than `slash-commands/` so it can
 * double as both the body of `/onthisdate` and a fact-tree leaf for the
 * random-insights scheduler: the leaf always means today
 * (`resolveToday`), while the command means whatever date the caller named
 * (`resolve`).
 */
@Injectable()
export class OnThisDateFactsService {
  constructor(
    private readonly onThisDate: OnThisDateService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
    private readonly leaderboard: LeaderboardService,
    private readonly eventCountLines: EventCountLinesService,
    private readonly monthDay: MonthDayService,
    private readonly killerInfo: PlayerKillerInfoFormatterService,
    private readonly playerRowButton: PlayerRowButtonService,
  ) {}

  resolveToday(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.resolve({ monthDay: this.monthDay.today(), scope });
  }

  async resolve(options: {
    monthDay: MonthDay;
    scope: FactScope;
  }): Promise<string | InteractionReplyOptions> {
    const { monthDay, scope } = options;
    const query = { month: monthDay.month, day: monthDay.day, scope };

    const result = await this.databaseTimeout.run(
      Promise.all([
        this.onThisDate.countMatchesPlayed(query),
        this.onThisDate.getEventCounts(query),
        this.onThisDate.getTopKilledPlayers({
          ...query,
          limit: TOPLIST_FETCH_LIMIT,
        }),
      ]),
      null,
    );
    if (result === null) {
      return ON_THIS_DATE_TIMEOUT_MESSAGE;
    }
    const [matchCount, counts, victims] = result;

    const title = `${this.entityComponents.getEmojiForPrefix(PLAYER_BUTTON_CUSTOM_ID_PREFIX)} On this date: ${this.monthDay.format(monthDay)}`;

    if (matchCount === 0) {
      return {
        embeds: [{ title, description: ON_THIS_DATE_NO_MATCHES_MESSAGE }],
      };
    }

    const lines = [
      `Matches played: ${matchCount}`,
      '',
      ...this.eventCountLines.build(counts, ON_THIS_DATE_NO_EVENTS_MESSAGE),
    ];

    const { shown, remainder } = this.rankVictims(victims);
    if (shown.length > 0) {
      lines.push(
        '',
        'Famous deaths:',
        ...shown.map((entry) => this.row(entry)),
      );
      if (remainder !== null) {
        lines.push(remainder);
      }
    }

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(
        shown.flatMap((entry) => this.entries(entry)),
      );
    if (overflowNote !== null) {
      lines.push(overflowNote);
    }

    return {
      embeds: [{ title, description: lines.join('\n') }],
      components,
    };
  }

  /**
   * A full fetch means the true result set is at least one row larger than
   * the window; drop that sentinel row and, when the boundary tie is still
   * open at the window edge, the remainder can only be reported
   * approximately - the same convention `LeaderboardService.resolveToplist`
   * uses, repeated here since these rows can't go through that method.
   */
  private rankVictims(victims: OnThisDateKilledPlayer[]): {
    shown: RankedVictim[];
    remainder: string | null;
  } {
    const saturated = victims.length === TOPLIST_FETCH_LIMIT;
    const considered = (saturated ? victims.slice(0, -1) : victims).map(
      (victim) => ({ ...victim, count: victim.sppTotal }),
    );
    const { rows, truncatedCount, tieGroupOpenEnded } =
      this.leaderboard.topRanksWithTies(
        considered,
        MAX_TOP_ENTRIES,
        MAX_LEADERBOARD_ENTRIES,
      );
    const openEnded = saturated && tieGroupOpenEnded;
    const exact =
      truncatedCount > 0 ? `…and ${truncatedCount} more tied.` : null;
    return {
      shown: rows,
      remainder: openEnded ? '…and lots more tied.' : exact,
    };
  }

  /**
   * The rank, a dot and a space, the victim name, a parenthesised
   * `position, team, race, coach` list, a spaced em dash, the SPP total, the
   * literal ` SPP, killed by `, the killer clause, and finally
   * ` (via a foul)` when the killer's `viaFoul` is set.
   */
  private row(victim: RankedVictim): string {
    const clause =
      victim.killer === null || victim.killer.kind === 'unknown'
        ? 'an opponent, in mysterious circumstances'
        : this.killerInfo.describe(victim.killer);
    const foulNote =
      victim.killer !== null && victim.killer.viaFoul ? ' (via a foul)' : '';
    return `${victim.rank}. ${victim.name} (${victim.positionName}, ${victim.teamName}, ${victim.raceName}, ${victim.coachName}) — ${victim.sppTotal} SPP, killed by ${clause}${foulNote}`;
  }

  /**
   * The victim's own button, then the killer's entries. Only the two
   * entities themselves are offered - never their position, race or coach -
   * matching every other list in this codebase.
   */
  private entries(victim: RankedVictim): EntityComponentEntry[] {
    return [
      this.playerRowButton.buildPlayerRowButton({
        playerId: victim.playerId,
        playerName: victim.name,
        positionId: victim.positionId,
        positionName: victim.positionName,
        isStarPlayer: victim.isStarPlayer,
      }),
      ...(victim.killer === null
        ? []
        : this.killerInfo.buildEntries(victim.killer)),
    ];
  }
}
