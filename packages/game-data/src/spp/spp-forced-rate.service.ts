import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  matchEvents,
  players,
  rulesSets,
  sppAwardValues,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNotNull, sum } from 'drizzle-orm';

/**
 * The rules set BBL's site recalculated older players' displayed totals
 * with when it re-platformed to BB2020.
 */
export const MIGRATION_RULES_SET_NAME = 'BB2020';

/**
 * Rules sets whose award values the BB2020 re-platforming never rewrote, so
 * a player in one of these eras already displays their real, era-correct
 * total on the site. DB2021 is included even though its touchdown value
 * (5) differs from BB2020's (3): it postdates the migration.
 */
export const POST_MIGRATION_RULES_SET_NAMES: readonly string[] = [
  'BB2020',
  'BB2025',
  'DB2021',
];

interface PlayerEventGroup {
  actionType: string;
  eventCount: number;
  storedSum: number;
}

/**
 * Re-sums a player's SPP-earning match events at the award rates BBL's site
 * would use TODAY, so the site's displayed career total can be compared
 * against something arithmetically equivalent.
 *
 * BBL's site recalculated pre-BB2020 players' displayed totals using
 * BB2020's award values (e.g. MVP 4, not CRP's 5). That recalculation is
 * presumed to be a replay of the events only, so any hidden adjustment
 * survives it:
 *
 *   displayed_total = SUM(event value at "current" rate) + adjustment
 *
 * "Current rate" is the event's own stored `spp_value` when the player's era
 * lists any {@link POST_MIGRATION_RULES_SET_NAMES} rules set (never
 * recalculated), and otherwise BB2020's award value for that action type
 * (race-specific row winning over the baseline, as in
 * `SppAwardValuesService.resolveSppValue`). An action type BB2020 has no row
 * for keeps its stored value, so an unmodelled award is never silently
 * dropped to zero.
 */
@Injectable()
export class SppForcedRateService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The forced-rate event sum per player. Every requested id is present in
   * the returned map; a player with no SPP-earning events gets 0. A player
   * whose era context cannot be resolved keeps their stored `spp_value`
   * sums unchanged, for the same reason an unmodelled action type does.
   */
  async forcedRateSumsForPlayers(
    playerIds: number[],
  ): Promise<Map<number, number>> {
    const sums = new Map<number, number>();
    const ids = [...new Set(playerIds)];
    if (ids.length === 0) {
      return sums;
    }

    const [contextRows, eventRows, rateRows] = await Promise.all([
      this.db
        .select({
          playerId: players.id,
          raceId: teams.raceId,
          rulesSetName: rulesSets.name,
        })
        .from(players)
        .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
        .innerJoin(teams, eq(teams.id, teamEras.teamId))
        .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, teamEras.eraId))
        .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
        .where(inArray(players.id, ids)),

      // Only events that actually earned SPP matter: a NULL spp_value means
      // the action earns none (e.g. a foul), and counting it at a forced
      // rate would invent SPP the player never had.
      this.db
        .select({
          playerId: matchEvents.actingPlayerId,
          actionType: matchEvents.actionType,
          eventCount: count(),
          storedSum: sum(matchEvents.sppValue),
        })
        .from(matchEvents)
        .where(
          and(
            inArray(matchEvents.actingPlayerId, ids),
            isNotNull(matchEvents.sppValue),
          ),
        )
        .groupBy(matchEvents.actingPlayerId, matchEvents.actionType),

      this.db
        .select({
          raceId: sppAwardValues.raceId,
          actionType: sppAwardValues.actionType,
          sppValue: sppAwardValues.sppValue,
        })
        .from(sppAwardValues)
        .innerJoin(rulesSets, eq(rulesSets.id, sppAwardValues.rulesSetId))
        .where(eq(rulesSets.name, MIGRATION_RULES_SET_NAME)),
    ]);

    const context = new Map<
      number,
      { raceId: number | null; postMigration: boolean }
    >();
    for (const row of contextRows) {
      const existing = context.get(row.playerId);
      const postMigration = POST_MIGRATION_RULES_SET_NAMES.includes(
        row.rulesSetName,
      );
      context.set(row.playerId, {
        raceId: row.raceId ?? existing?.raceId ?? null,
        postMigration: (existing?.postMigration ?? false) || postMigration,
      });
    }

    const groups = new Map<number, PlayerEventGroup[]>();
    for (const row of eventRows) {
      // Non-null for the same reason as in SppTotalsService: every row came
      // back through the inArray filter on acting_player_id.
      const playerId = row.playerId as number;
      const group = groups.get(playerId) ?? [];
      group.push({
        actionType: String(row.actionType),
        eventCount: Number(row.eventCount),
        storedSum: row.storedSum === null ? 0 : Number(row.storedSum),
      });
      groups.set(playerId, group);
    }

    const rates = new Map<string, number>();
    for (const row of rateRows) {
      rates.set(`${row.raceId ?? 'baseline'}:${row.actionType}`, row.sppValue);
    }

    for (const id of ids) {
      const playerContext = context.get(id);
      let total = 0;
      for (const group of groups.get(id) ?? []) {
        if (playerContext === undefined || playerContext.postMigration) {
          total += group.storedSum;
          continue;
        }
        const raceRate =
          playerContext.raceId === null
            ? undefined
            : rates.get(`${playerContext.raceId}:${group.actionType}`);
        const rate = raceRate ?? rates.get(`baseline:${group.actionType}`);
        total += rate === undefined ? group.storedSum : rate * group.eventCount;
      }
      sums.set(id, total);
    }
    return sums;
  }
}
