import type { SppCareerCounts } from '@blood-bowl-tracker/api-contract';
import { SPP_CAREER_COUNT_KEYS } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, matchEvents } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, inArray } from 'drizzle-orm';

import type {
  ActionType,
  SppCareerCountGroup,
} from '../shared/match-event-types';
import {
  SPP_CAREER_COUNT_GROUPS,
  SPP_EARNING_ACTION_TYPES,
} from '../shared/match-event-types';

/**
 * How many SPP-earning match events a batch of players actually has IMPORTED,
 * counted per career-count group rather than per action type.
 *
 * The grouping exists because TP's career counters are grouped: one combined
 * interception counter (its raw data has no deflection field at all) and one
 * combined casualty counter (no severity breakdown). Comparing TP's grouped
 * career figure against an ungrouped imported figure would be comparing
 * different things, so this side is folded to match.
 *
 * Only events where the player is the ACTING participant count — the same rule
 * {@link SppTotalsService} applies, and for the same reason: SPP is earned by
 * doing something, never by having something done to you.
 */
@Injectable()
export class SppEventCountsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** A count of zero in every group. */
  emptyCounts(): SppCareerCounts {
    return {
      touchdown: 0,
      completion: 0,
      interception: 0,
      mvp_award: 0,
      casualty: 0,
    };
  }

  /**
   * One grouped query over `match_events`, folded into a per-player,
   * per-group count. Every requested id is present in the returned map — a
   * player with no SPP-earning events gets an all-zero count, not a missing
   * entry, so callers never have to distinguish "none" from "unknown".
   */
  async importedCountsForPlayers(
    playerIds: number[],
  ): Promise<Map<number, SppCareerCounts>> {
    const counts = new Map<number, SppCareerCounts>();
    const ids = [...new Set(playerIds)];
    if (ids.length === 0) {
      return counts;
    }
    for (const id of ids) {
      counts.set(id, this.emptyCounts());
    }

    const rows = await this.db
      .select({
        playerId: matchEvents.actingPlayerId,
        actionType: matchEvents.actionType,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .where(
        and(
          inArray(matchEvents.actingPlayerId, ids),
          inArray(matchEvents.actionType, SPP_EARNING_ACTION_TYPES),
        ),
      )
      .groupBy(matchEvents.actingPlayerId, matchEvents.actionType);

    for (const row of rows) {
      const group = this.groupFor(row.actionType);
      // match_events.action_type is a nullable column, so a null (or a type
      // outside every group) is skipped rather than forced into a group.
      if (group === undefined || row.playerId === null) {
        continue;
      }
      const entry = counts.get(row.playerId);
      if (entry !== undefined) {
        entry[group] += row.count;
      }
    }
    return counts;
  }

  /** The group an imported action type rolls up into, if any. */
  private groupFor(
    actionType: ActionType | null,
  ): SppCareerCountGroup | undefined {
    if (actionType === null) {
      return undefined;
    }
    return SPP_CAREER_COUNT_KEYS.find((key) =>
      SPP_CAREER_COUNT_GROUPS[key].includes(actionType),
    );
  }
}
