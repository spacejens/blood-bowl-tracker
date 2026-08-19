import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { Db, MatchEvent } from '@blood-bowl-tracker/db';
import {
  DB,
  matchEventExternalIds,
  matchEvents,
  matchTeams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import { SppAwardValuesService } from '../spp/spp-award-values.service';

export class MatchEventUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class MatchEventsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sppAwardValues: SppAwardValuesService,
  ) {}

  async upsert(
    data: UpsertMatchEvent,
  ): Promise<{ matchEvent: MatchEvent; created: boolean }> {
    const matchTeamIdByTeamEraId = await this.loadMatchTeams(data.matchId);

    const actingMatchTeamId = this.resolveMatchTeam(
      matchTeamIdByTeamEraId,
      data.actingTeamEraId,
    );
    const consequenceMatchTeamId = this.resolveMatchTeam(
      matchTeamIdByTeamEraId,
      data.consequenceTeamEraId,
    );

    this.assertDeathActionTypeInvariant(data);

    const sppValue = await this.resolveSppValue(data);

    // Every field is passed through exactly as supplied: `undefined` means the
    // payload said nothing about that column and upsertByExternalIds strips it,
    // while an explicit `null` writes null.
    const values = {
      matchId: data.matchId,
      actingMatchTeamId,
      consequenceMatchTeamId,
      actingPlayerId: data.actingPlayerId,
      consequencePlayerId: data.consequencePlayerId,
      actionType: data.actionType,
      consequenceType: data.consequenceType,
      actingUnidentifiedKind: data.actingUnidentifiedKind,
      consequenceUnidentifiedKind: data.consequenceUnidentifiedKind,
      consequenceAvoidedBy: data.consequenceAvoidedBy,
      consequenceAvoidedSeverity: data.consequenceAvoidedSeverity,
      eventType: data.eventType,
      weatherType: data.weatherType,
      inducementsCost: data.inducementsCost,
      inducementsFromTreasury: data.inducementsFromTreasury,
      winnings: data.winnings,
      fanFactor: data.fanFactor,
      journeymenCount: data.journeymenCount,
      prayersToNuffle: data.prayersToNuffle,
      dedicatedFans: data.dedicatedFans,
      secretObjective: data.secretObjective,
      expensiveMistake: data.expensiveMistake,
      sppValue,
    };

    const { row: matchEvent, created } = await upsertByExternalIds<
      typeof matchEvents,
      typeof matchEventExternalIds
    >({
      db: this.db,
      entityTable: matchEvents,
      entityIdColumn: matchEvents.id,
      values,
      externalIdTable: matchEventExternalIds,
      ownerIdColumn: matchEventExternalIds.matchEventId,
      externalSystemIdColumn: matchEventExternalIds.externalSystemId,
      externalIdColumn: matchEventExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: MatchEventUpsertConflictError,
      entityLabelPlural: 'match events',
      buildExternalIdRow: (matchEventId, pair) => ({ matchEventId, ...pair }),
    });

    return { matchEvent, created };
  }

  /**
   * The event's SPP award. An explicitly supplied value always wins — a
   * source that reports its own figure (TP) is never second-guessed by a
   * recomputation, and no computation is attempted when it wasn't requested:
   * `undefined` here, which `upsertByExternalIds` strips so the column is
   * left alone rather than nulled.
   *
   * Once computation IS requested, though, every other outcome writes `null`
   * rather than leaving the column alone: an event with no acting player or
   * action type cannot earn SPP, and a resolvable player/action pair the
   * award table has no row for currently earns none either. Both are real
   * answers ("this event awards no SPP"), not "unknown" — and treating them
   * as unknown would let a stale `spp_value` survive a re-import that
   * downgrades a previously SPP-earning event (e.g. a BBL correction changing
   * its action type), which `SppTotalsService` would then keep counting.
   */
  private async resolveSppValue(
    data: UpsertMatchEvent,
  ): Promise<number | null | undefined> {
    if (data.sppValue !== undefined) {
      return data.sppValue;
    }
    if (data.computeSppValue !== true) {
      return undefined;
    }
    if (
      data.actingPlayerId === undefined ||
      data.actingPlayerId === null ||
      data.actionType === undefined ||
      data.actionType === null
    ) {
      return null;
    }
    return (
      (await this.sppAwardValues.resolveSppValue({
        actingPlayerId: data.actingPlayerId,
        actionType: data.actionType,
      })) ?? null
    );
  }

  private async loadMatchTeams(matchId: number): Promise<Map<number, number>> {
    const rows = await this.db
      .select({ id: matchTeams.id, teamEraId: matchTeams.teamEraId })
      .from(matchTeams)
      .where(eq(matchTeams.matchId, matchId));
    return new Map(rows.map((r) => [r.teamEraId, r.id]));
  }

  /**
   * The counters `PlayersService` builds for the kills feature rely on every
   * `death`-consequence row also carrying `actionType` of either `'death'` or
   * `'foul'` — that's what makes `casualties.killed + fouls.killed` exactly
   * equal the deepdive kills list length. Only checked when this call's
   * payload supplies both fields together: `undefined` means "leave the
   * existing column alone on an update", and resolving what an update's
   * final value would be would require reading the row back before writing
   * it, which is not worth adding on every upsert just to cover this one
   * combination. The BBL and TP importers always assert both fields together
   * for a death/foul event, so this still catches the cases those importers
   * (or a future one, or a manual edit) could actually get wrong.
   */
  private assertDeathActionTypeInvariant(data: UpsertMatchEvent): void {
    if (data.consequenceType !== 'death' || data.actionType === undefined) {
      return;
    }
    if (data.actionType !== 'death' && data.actionType !== 'foul') {
      throw new MatchEventUpsertConflictError(
        `A death consequence requires actionType 'death' or 'foul', got '${data.actionType}'`,
      );
    }
  }

  private resolveMatchTeam(
    matchTeamIdByTeamEraId: Map<number, number>,
    teamEraId: number | undefined,
  ): number | undefined {
    if (teamEraId === undefined) {
      return undefined;
    }
    const matchTeamId = matchTeamIdByTeamEraId.get(teamEraId);
    if (matchTeamId === undefined) {
      throw new MatchEventUpsertConflictError(
        `Team era ${teamEraId} is not a participant of match's match_teams`,
      );
    }
    return matchTeamId;
  }
}
