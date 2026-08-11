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
   * recomputation. Only a caller that asked for computation and gave an
   * acting player and an action type gets one; everything else returns
   * `undefined`, which upsertByExternalIds strips so the column is left
   * alone rather than nulled.
   */
  private async resolveSppValue(
    data: UpsertMatchEvent,
  ): Promise<number | null | undefined> {
    if (data.sppValue !== undefined) {
      return data.sppValue;
    }
    if (
      data.computeSppValue !== true ||
      data.actingPlayerId === undefined ||
      data.actingPlayerId === null ||
      data.actionType === undefined ||
      data.actionType === null
    ) {
      return undefined;
    }
    return this.sppAwardValues.resolveSppValue({
      actingPlayerId: data.actingPlayerId,
      actionType: data.actionType,
    });
  }

  private async loadMatchTeams(matchId: number): Promise<Map<number, number>> {
    const rows = await this.db
      .select({ id: matchTeams.id, teamEraId: matchTeams.teamEraId })
      .from(matchTeams)
      .where(eq(matchTeams.matchId, matchId));
    return new Map(rows.map((r) => [r.teamEraId, r.id]));
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
