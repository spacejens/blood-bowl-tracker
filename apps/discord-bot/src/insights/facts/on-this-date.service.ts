import type {
  FactScope,
  OnThisDateKilledPlayer,
  OnThisDateVictim,
  PlayerKillerInfo,
} from '@blood-bowl-tracker/game-data';
import { OnThisDateService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { PlayerKillerInfoFormatterService } from '../../deepdive/facts/player-killer-info-formatter.service';
import { PlayerRowButtonService } from '../../deepdive/player-row-button.service';
import {
  MAX_DESCRIPTION_LENGTH,
  OVERFLOW_NOTE_BUDGET,
} from '../../description-limits';
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

type CountedVictim = OnThisDateVictim & { count: number };
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

    const { shown: rankedVictims, remainder } = this.rankVictims(victims);
    const killedVictims =
      await this.onThisDate.getKillersForVictims(rankedVictims);
    const candidates: RankedVictim[] = rankedVictims.map((victim, index) => ({
      ...victim,
      killer: killedVictims[index].killer,
    }));

    const { lines: victimLines, shown } = this.buildVictimSection(
      candidates,
      remainder,
      lines,
    );
    lines.push(...victimLines);

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
  private rankVictims(victims: OnThisDateVictim[]): {
    shown: (CountedVictim & { rank: number })[];
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
   * Selects a prefix of the tie-trimmed `victims` that keeps the whole
   * description within `MAX_DESCRIPTION_LENGTH` and renders the "Famous
   * deaths:" section, plus an exact "…and N more not shown." note when
   * anything was left out by length. This is a second, additional safety net
   * layered on top of `rankVictims`' own tie-based trim to roughly five rows:
   * it only ever drops rows the tie logic already decided to show, and only
   * when their rendered text would blow the character budget — the same
   * greedy, budget-then-fill approach `PlayerKillsSectionService.build` uses
   * for the equivalent kills-list section, adapted here for the extra
   * fixed-size pieces (the counter block, the heading, and the tie
   * remainder note) this description also carries.
   */
  private buildVictimSection(
    victims: RankedVictim[],
    remainder: string | null,
    otherLines: string[],
  ): { lines: string[]; shown: RankedVictim[] } {
    if (victims.length === 0) {
      return { lines: [], shown: [] };
    }

    const heading = ['', 'Famous deaths:'];
    const remainderLines = remainder === null ? [] : [remainder];
    let budget =
      MAX_DESCRIPTION_LENGTH -
      otherLines.join('\n').length -
      1 - // the newline joining the counter block to the heading
      heading.join('\n').length -
      1 - // the newline joining the heading to the first victim row
      (remainderLines.length === 0 ? 0 : remainderLines.join('\n').length + 1) -
      OVERFLOW_NOTE_BUDGET;

    const shown: RankedVictim[] = [];
    for (const victim of victims) {
      const cost = this.row(victim).length + 1;
      if (cost > budget) {
        break;
      }
      budget -= cost;
      shown.push(victim);
    }

    const lines = [...heading, ...shown.map((entry) => this.row(entry))];
    const truncatedCount = victims.length - shown.length;
    if (truncatedCount > 0) {
      lines.push(`…and ${truncatedCount} more not shown.`);
    }
    if (remainder !== null) {
      lines.push(remainder);
    }
    return { lines, shown };
  }

  /**
   * The rank, a dot and a space, the victim name, a parenthesised
   * `position, team, race, coach` list, a spaced em dash, the SPP total, the
   * literal ` SPP, killed by `, the killer clause, and finally
   * ` (via a foul)` when the killer's `viaFoul` is set.
   */
  private row(victim: RankedVictim): string {
    const clause = this.killerClause(victim.killer);
    const foulNote =
      victim.killer !== null && victim.killer.viaFoul ? ' (via a foul)' : '';
    return `${victim.rank}. ${victim.name} (${victim.positionName}, ${victim.teamName}, ${victim.raceName}, ${victim.coachName}) — ${victim.sppTotal} SPP, killed by ${clause}${foulNote}`;
  }

  /**
   * The killer clause for one row, mid-sentence after "killed by ". A named
   * killer keeps `describe`'s own capitalisation (it's a proper name); every
   * other case — an unidentified team, an ambiguous set of teams, or no
   * killer resolved at all — goes through the same
   * `PlayerKillerInfoFormatterService.describe` every other caller uses, with
   * only its leading capital lowered to fit mid-sentence here. Treating a
   * `null` killer as `{ kind: 'unknown' }` before calling `describe` avoids a
   * second, duplicated "mysterious circumstances" string that a future
   * wording change to the formatter could silently miss.
   */
  private killerClause(killer: PlayerKillerInfo | null): string {
    if (killer !== null && killer.kind === 'player') {
      return this.killerInfo.describe(killer);
    }
    const described = this.killerInfo.describe(
      killer ?? { kind: 'unknown', viaFoul: false },
    );
    return described.charAt(0).toLowerCase() + described.slice(1);
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
