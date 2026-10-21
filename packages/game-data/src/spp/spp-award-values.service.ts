import type {
  SyncSppAwardValues,
  SyncSppAwardValuesResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewSppAwardValue } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eraRulesSets,
  inArray,
  isNull,
  or,
  players,
  races,
  rulesSets,
  sppAwardValues,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { ActionType } from '@blood-bowl-tracker/domain-enums';
import { SPP_EARNING_ACTION_TYPES } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { SppAwardValueValidationError } from '../shared/spp-award-value-validation-error';

/**
 * `SPP_EARNING_ACTION_TYPES` viewed as plain action types, so `includes`
 * accepts any `ActionType` rather than only the narrower literal subset.
 */
const SPP_EARNING_TYPES: readonly ActionType[] = SPP_EARNING_ACTION_TYPES;

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
 * mixed-value era, where an event's award would depend on which of the
 * era's rules sets it resolved to, is deliberately not modelled.
 *
 * No caching: an import re-resolves per event, which is a single indexed
 * query against a table of a few dozen rows, and a long-lived cache in a
 * server process would go stale the moment the award table is re-seeded.
 */
@Injectable()
export class SppAwardValuesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert or update the supplied award rows, matched on their natural key
   * `(rulesSetId, raceId, actionType)`. Idempotent: re-running a seed rewrites
   * `spp_value` in place rather than duplicating rows.
   *
   * Deliberately *not* `INSERT ... ON CONFLICT DO UPDATE`. `spp_award_values`
   * is a history-tracked table, and Postgres fires its row-level BEFORE INSERT
   * versioning trigger for every candidate row of an ON CONFLICT statement —
   * including rows the conflict then converts into an UPDATE of an existing
   * row. The trigger writes a `spp_award_values_history` row keyed by the
   * candidate's already-consumed serial id, which never lands in the parent
   * table, so the history table's FK back to `spp_award_values(id)` fails and
   * the whole batch errors out on any re-run against populated data. Selecting
   * first and then issuing plain INSERT / plain UPDATE statements is the same
   * pattern `upsertByExternalIds` uses, for the same reason.
   *
   * The whole batch is validated before any write: a batch naming one
   * natural key twice, or a value naming a rules set or race that does not
   * exist, is rejected with an SppAwardValueValidationError naming it.
   */
  async sync(data: SyncSppAwardValues): Promise<SyncSppAwardValuesResult> {
    if (data.values.length === 0) {
      return { sppAwardValueIds: [] };
    }

    await this.validateBatch(data);

    // Over-fetch by rules set and match in memory: the table holds only a few
    // dozen rows per rules set, and this avoids the null-safety awkwardness of
    // matching a nullable raceId in SQL.
    const rulesSetIds = [
      ...new Set(data.values.map((value) => value.rulesSetId)),
    ];
    const existingRows = await this.db
      .select({
        id: sppAwardValues.id,
        rulesSetId: sppAwardValues.rulesSetId,
        raceId: sppAwardValues.raceId,
        actionType: sppAwardValues.actionType,
      })
      .from(sppAwardValues)
      .where(inArray(sppAwardValues.rulesSetId, rulesSetIds));

    const existingIdByKey = new Map(
      existingRows.map((row) => [this.naturalKey(row), row.id]),
    );

    const toInsert: NewSppAwardValue[] = [];
    const toUpdate: { id: number; sppValue: number }[] = [];
    for (const value of data.values) {
      const existingId = existingIdByKey.get(this.naturalKey(value));
      if (existingId === undefined) {
        toInsert.push({
          rulesSetId: value.rulesSetId,
          raceId: value.raceId,
          actionType: value.actionType,
          sppValue: value.sppValue,
        });
      } else {
        toUpdate.push({ id: existingId, sppValue: value.sppValue });
      }
    }

    // One transaction around the insert and every update: the caller treats
    // this single call as one batch that either wholly succeeds or wholly
    // fails.
    return this.db.transaction(async (tx) => {
      const sppAwardValueIds: number[] = [];

      if (toInsert.length > 0) {
        const inserted = await tx
          .insert(sppAwardValues)
          .values(toInsert)
          .returning({ id: sppAwardValues.id });
        sppAwardValueIds.push(...inserted.map((row) => row.id));
      }

      for (const row of toUpdate) {
        const updated = await tx
          .update(sppAwardValues)
          .set({ sppValue: row.sppValue })
          .where(eq(sppAwardValues.id, row.id))
          .returning({ id: sppAwardValues.id });
        sppAwardValueIds.push(...updated.map((updatedRow) => updatedRow.id));
      }

      return { sppAwardValueIds };
    });
  }

  /**
   * Reject the batch when it names one natural key twice, or a value names a
   * rules set or race that does not exist. A repeated key would otherwise
   * collide on the table's unique constraint (both copies taking the insert
   * path) or quietly let the last copy win (both taking the update path),
   * and a missing reference would surface as a raw foreign-key error. The
   * race lookup is skipped when every value is a baseline, since there is
   * then no race to look up.
   */
  private async validateBatch(data: SyncSppAwardValues): Promise<void> {
    const seenKeys = new Set<string>();
    for (const value of data.values) {
      const key = this.naturalKey(value);
      if (seenKeys.has(key)) {
        const race =
          value.raceId === null
            ? 'the baseline (no race)'
            : `race ${value.raceId}`;
        throw new SppAwardValueValidationError(
          `The ${value.actionType} award under rules set ${value.rulesSetId} for ${race} appears more than once in the same batch`,
        );
      }
      seenKeys.add(key);
    }

    const rulesSetIds = [
      ...new Set(data.values.map((value) => value.rulesSetId)),
    ];
    const raceIds = [
      ...new Set(
        data.values.flatMap((value) =>
          value.raceId === null ? [] : [value.raceId],
        ),
      ),
    ];
    const rulesSetRows = await this.db
      .select({ id: rulesSets.id })
      .from(rulesSets)
      .where(inArray(rulesSets.id, rulesSetIds));
    const raceRows =
      raceIds.length === 0
        ? []
        : await this.db
            .select({ id: races.id })
            .from(races)
            .where(inArray(races.id, raceIds));

    const knownRulesSetIds = new Set(rulesSetRows.map((row) => row.id));
    const knownRaceIds = new Set(raceRows.map((row) => row.id));
    for (const value of data.values) {
      if (!knownRulesSetIds.has(value.rulesSetId)) {
        throw new SppAwardValueValidationError(
          `Rules set ${value.rulesSetId} does not exist, so no SPP award value can be recorded under it`,
        );
      }
      if (value.raceId !== null && !knownRaceIds.has(value.raceId)) {
        throw new SppAwardValueValidationError(
          `Race ${value.raceId} does not exist, so no SPP award value can be recorded for it`,
        );
      }
    }
  }

  /**
   * The award row's natural key as a string, so existing rows and incoming
   * values can be matched through a plain `Map`. `raceId` is nullable and a
   * null baseline is a real, distinct key — hence the explicit `'null'`
   * marker rather than letting `null` stringify ambiguously.
   */
  private naturalKey(row: {
    rulesSetId: number;
    raceId: number | null;
    actionType: string;
  }): string {
    return `${row.rulesSetId}|${row.raceId ?? 'null'}|${row.actionType}`;
  }

  /**
   * The award for one event, or `undefined` when this action type earns no
   * SPP or the table has no row for the player's rules set. `undefined` and
   * `0` are different answers: a seeded zero is a real award of nothing.
   */
  async resolveSppValue(
    options: ResolveSppValueOptions,
  ): Promise<number | undefined> {
    if (!SPP_EARNING_TYPES.includes(options.actionType)) {
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
