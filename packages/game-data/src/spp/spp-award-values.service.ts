import type {
  SyncSppAwardValues,
  SyncSppAwardValuesResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  players,
  sppAwardValues,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

import type { ActionType } from '../shared/match-event-types';
import { SPP_EARNING_ACTION_TYPES } from '../shared/match-event-types';

export interface ResolveSppValueOptions {
  actingPlayerId: number;
  actionType: ActionType;
}

/**
 * Owns the standardised Star Player Points award table: seeding it, and
 * resolving one event's award from it.
 *
 * Resolution goes through the acting player rather than the match: a player
 * belongs to a team era, which fixes both the era (→ its rules sets, via
 * `era_rules_sets`) and the team (→ its race). That is one join chain and one
 * query instead of two, and it is the same era the match belongs to.
 *
 * An era may list several rules sets. Within every era configured today
 * (`tools/import-bbl/import-bbl-config.json5`,
 * `tools/import-tp/import-tp-config.json5`) all of an era's rules sets carry
 * identical SPP values, so any matching row is the right answer. A genuinely
 * mixed-value era is deliberately not modelled — see the spec's "Resolving a
 * match event's rules set".
 *
 * No caching: an import re-resolves per event, which is a single indexed
 * query against a table of a few dozen rows, and a long-lived cache in a
 * server process would go stale the moment the award table is re-seeded.
 */
@Injectable()
export class SppAwardValuesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert or update the supplied award rows, matched on their natural key.
   * Idempotent: re-running a seed rewrites `spp_value` in place rather than
   * duplicating rows, which the NULLS NOT DISTINCT unique constraint makes
   * work for baseline (`raceId: null`) rows too.
   */
  async sync(data: SyncSppAwardValues): Promise<SyncSppAwardValuesResult> {
    if (data.values.length === 0) {
      return { sppAwardValueIds: [] };
    }

    const rows = await this.db
      .insert(sppAwardValues)
      .values(
        data.values.map((value) => ({
          rulesSetId: value.rulesSetId,
          raceId: value.raceId,
          actionType: value.actionType,
          sppValue: value.sppValue,
        })),
      )
      .onConflictDoUpdate({
        target: [
          sppAwardValues.rulesSetId,
          sppAwardValues.raceId,
          sppAwardValues.actionType,
        ],
        set: { sppValue: sql`excluded.spp_value` },
      })
      .returning({ id: sppAwardValues.id });

    return { sppAwardValueIds: rows.map((row) => row.id) };
  }

  /**
   * The award for one event, or `undefined` when this action type earns no
   * SPP or the table has no row for the player's rules set. `undefined` and
   * `0` are different answers: a seeded zero is a real award of nothing.
   */
  async resolveSppValue(
    options: ResolveSppValueOptions,
  ): Promise<number | undefined> {
    if (!SPP_EARNING_ACTION_TYPES.includes(options.actionType)) {
      return undefined;
    }

    const rows = await this.db
      .select({
        raceId: sppAwardValues.raceId,
        sppValue: sppAwardValues.sppValue,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, teamEras.eraId))
      .innerJoin(
        sppAwardValues,
        and(
          eq(sppAwardValues.rulesSetId, eraRulesSets.rulesSetId),
          eq(sppAwardValues.actionType, options.actionType),
          or(
            isNull(sppAwardValues.raceId),
            eq(sppAwardValues.raceId, teams.raceId),
          ),
        ),
      )
      .where(eq(players.id, options.actingPlayerId));

    // A race-specific row always wins over the baseline it overrides.
    const override = rows.find((row) => row.raceId !== null);
    return (override ?? rows[0])?.sppValue;
  }
}
