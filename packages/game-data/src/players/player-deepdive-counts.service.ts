import type { Db } from '@blood-bowl-tracker/db';
import { DB, matchEvents } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNull, or } from 'drizzle-orm';

import type { MatchEventSelector } from '../shared/match-event-counts';
import { countMatchEventsForPlayer } from '../shared/match-event-counts';
import type { ActionType, ConsequenceType } from '../shared/match-event-types';
import {
  CASUALTY_CAUSED_TYPES,
  CATCH_TYPES,
  COMPLETION_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  MVP_AWARD_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  THROW_TEAM_MATE_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';

/**
 * One counter that carries its own severity breakdown: a total plus the
 * subset that inflicted a serious injury or a death. Used for both the
 * casualty and the foul counters, which report the same three numbers over
 * different event populations.
 */
export interface PlayerDeepdiveEventGroup {
  total: number;
  seriousInjuries: number;
  killed: number;
}

/**
 * The player deepdive's event counters. The `simple` categories are plain
 * label/count rows; casualties and fouls each carry a severity breakdown so
 * the embed can render them as one line apiece.
 *
 * `casualties.killed` and `fouls.killed`/`fouls.seriousInjuries` now mean
 * "attempted", not merely "confirmed" — they fold in a prevented (saved)
 * attempt alongside a confirmed one, and, for `casualties.killed` only, a
 * `'death'`-actioned row with no consequence recorded at all.
 *
 * `casualties.killed` counts via `countDeathOutcome`, which matches a
 * confirmed death (`consequenceType = 'death'`), a prevented one
 * (`consequenceType = 'casualty_avoided'` with `consequenceAvoidedSeverity =
 * 'death'`), or a `'death'`-actioned row with no consequence recorded at all
 * — `actionType = 'death'` alone already certifies the severity of what the
 * player did, so the unpaired case belongs here too. `fouls.killed` and
 * `fouls.seriousInjuries` count via `countFoulOutcome`, which matches a
 * confirmed outcome
 * (`consequenceType` in the target severity set) OR a prevented one
 * (`consequenceType = 'casualty_avoided'` with `consequenceAvoidedSeverity`
 * in that set) — `actionType = 'foul'` carries no severity of its own, unlike
 * `'death'`, so there is no unpaired/no-consequence case to fold in for
 * fouls.
 *
 * Since every event with `actionType = 'death'` or `actionType = 'foul'` AND
 * `consequenceType = 'death'` OR (`consequenceType = 'casualty_avoided'` AND
 * `consequenceAvoidedSeverity = 'death'`) OR (`actionType = 'death'` AND
 * `consequenceType IS NULL`) is exactly what `fouls.killed` plus
 * `casualties.killed` counts, and `PlayerDeathService`'s `killFilter` is
 * built from literally these same conditions ORed together, the two totals
 * are exactly the number of kills the deepdive's Kills section lists. This is
 * true by construction, not merely typical.
 *
 * `casualties.total` (via `countActingEvents` below) can also disagree with
 * the toplist's `countCasualtiesCausedByPlayer` (which goes through the
 * joined `countMatchEventsByPlayer`) for a player with a casualty event whose
 * `actingMatchTeamId` is null — the deepdive number can come out higher than
 * the leaderboard number for that same player. This divergence is
 * intentional: see `countActingEvents`'s doc comment for why.
 */
export interface PlayerDeepdiveCategoryCounts {
  simple: { label: string; count: number }[];
  casualties: PlayerDeepdiveEventGroup;
  fouls: PlayerDeepdiveEventGroup;
}

@Injectable()
export class PlayerDeepdiveCountsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Every counter the player deepdive shows, in one round trip. Issued as a
   * single `Promise.all` so the caller's one timeout message covers the whole
   * group.
   */
  async getDeepdiveCategoryCounts(
    playerId: number,
  ): Promise<PlayerDeepdiveCategoryCounts> {
    const simpleCategories: { label: string; selector: MatchEventSelector }[] =
      [
        {
          label: 'MVP awards',
          selector: { role: 'acting', types: MVP_AWARD_TYPES },
        },
        {
          label: 'Touchdowns scored',
          selector: { role: 'acting', types: TOUCHDOWN_TYPES },
        },
        {
          label: 'Completions',
          selector: { role: 'acting', types: COMPLETION_TYPES },
        },
        {
          label: 'Interceptions',
          selector: { role: 'acting', types: INTERCEPTION_TYPES },
        },
        {
          label: 'Deflections',
          selector: { role: 'acting', types: DEFLECTION_TYPES },
        },
        {
          label: 'Team-mates thrown',
          selector: { role: 'acting', types: THROW_TEAM_MATE_TYPES },
        },
        {
          label: 'Successful catches',
          selector: { role: 'acting', types: CATCH_TYPES },
        },
      ];
    const [
      simpleCounts,
      casualtyTotal,
      casualtySeriousInjuries,
      casualtyKilled,
      foulTotal,
      foulSeriousInjuries,
      foulKilled,
    ] = await Promise.all([
      Promise.all(
        simpleCategories.map((category) =>
          this.countDeepdiveEvents(playerId, category.selector),
        ),
      ),
      this.countActingEvents(playerId, CASUALTY_CAUSED_TYPES),
      this.countActingEvents(playerId, SERIOUS_INJURY_CAUSED_TYPES),
      this.countDeathOutcome(playerId),
      this.countActingEvents(playerId, FOUL_TYPES),
      this.countFoulOutcome(playerId, SERIOUS_INJURY_SUFFERED_TYPES),
      this.countFoulOutcome(playerId, ['death']),
    ]);
    return {
      simple: simpleCategories.map((category, index) => ({
        label: category.label,
        count: simpleCounts[index],
      })),
      casualties: {
        total: casualtyTotal,
        seriousInjuries: casualtySeriousInjuries,
        killed: casualtyKilled,
      },
      fouls: {
        total: foulTotal,
        seriousInjuries: foulSeriousInjuries,
        killed: foulKilled,
      },
    };
  }

  /**
   * One deepdive counter for the "simple" categories: unscoped, single-role,
   * for this player alone. Not used for the casualty/foul groups — see
   * `countActingEvents` and `countCombinedEvents` below for why those need a
   * different query shape.
   */
  private countDeepdiveEvents(
    playerId: number,
    selector: MatchEventSelector,
  ): Promise<number> {
    return countMatchEventsForPlayer({ db: this.db, playerId, selector });
  }

  /**
   * Events this player committed with one of the given action types, no
   * consequence filter. A direct `match_events` filter, with none of the join
   * graph `countDeepdiveEvents` carries: `countMatchEventsForPlayer` inner-joins
   * `matchTeams` on `actingMatchTeamId`, a nullable column, so an event with
   * that column unset would be invisible to it. The casualty/foul group
   * counters must never drop such a row, because `countCombinedEvents` below
   * (their `killed`/`seriousInjuries` siblings) does not join at all —
   * differing join shapes on lines that share one "total" would let a
   * sub-count exceed its own total. Deepdive counters apply no scope
   * narrowing, so the join graph earns nothing here anyway.
   *
   * This can make a deepdive counter disagree with its toplist counterpart
   * (e.g. `countCasualtiesCausedByPlayer`, which still goes through the
   * joined `countMatchEventsByPlayer`) for a player with a null
   * `actingMatchTeamId` event. That's an accepted tradeoff, not an oversight:
   * a single deepdive's own lines staying internally consistent with each
   * other matters more than that deepdive agreeing with a cross-player
   * leaderboard, and the toplist genuinely needs the join to narrow its scope
   * (era/league/competition), which a single-player deepdive has no use for.
   */
  private async countActingEvents(
    playerId: number,
    types: readonly ActionType[],
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: count(matchEvents.id) })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.actingPlayerId, playerId),
          inArray(matchEvents.actionType, types),
        ),
      );
    return row.count;
  }

  /**
   * Foul-caused events (or prevented foul-caused events) whose confirmed or
   * would-have-been severity falls in `severities`. Covers both "it happened"
   * (`consequenceType` is one of `severities`) and "it was prevented"
   * (`consequenceType = 'casualty_avoided'` and `consequenceAvoidedSeverity`
   * is one of `severities`), so a foul that would have caused a serious
   * injury but was saved by an apothecary still counts. `actionType = 'foul'`
   * carries no severity of its own — unlike `actionType = 'death'`, which
   * certifies severity by itself — so there is no unpaired/no-consequence
   * case to fold in here the way there is for deaths.
   */
  private async countFoulOutcome(
    playerId: number,
    severities: readonly ConsequenceType[],
  ): Promise<number> {
    const [row] = await this.db
      .select({ count: count(matchEvents.id) })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.actingPlayerId, playerId),
          eq(matchEvents.actionType, 'foul'),
          or(
            inArray(matchEvents.consequenceType, severities),
            and(
              eq(matchEvents.consequenceType, 'casualty_avoided'),
              inArray(matchEvents.consequenceAvoidedSeverity, severities),
            ),
          ),
        ),
      );
    return row.count;
  }

  /**
   * Death-severity events this player caused, whether confirmed, prevented, or
   * unrecorded — structurally identical to `PlayerDeathService`'s `killFilter`
   * for its own `actionType = 'death'` branch, so this count and the Kills
   * list's death-side rows are guaranteed to agree by construction, not by
   * importer convention.
   */
  private async countDeathOutcome(playerId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count(matchEvents.id) })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.actingPlayerId, playerId),
          eq(matchEvents.actionType, 'death'),
          or(
            eq(matchEvents.consequenceType, 'death'),
            and(
              eq(matchEvents.consequenceType, 'casualty_avoided'),
              eq(matchEvents.consequenceAvoidedSeverity, 'death'),
            ),
            isNull(matchEvents.consequenceType),
          ),
        ),
      );
    return row.count;
  }
}
