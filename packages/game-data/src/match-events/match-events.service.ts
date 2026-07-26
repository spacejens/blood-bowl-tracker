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

export class MatchEventUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class MatchEventsService {
  constructor(@Inject(DB) private readonly db: Db) {}

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

    // Every field is passed through exactly as supplied: `undefined` means the
    // payload said nothing about that column and upsertByExternalIds strips it,
    // while an explicit `null` writes null (issue #174).
    const values = {
      matchId: data.matchId,
      actingMatchTeamId,
      consequenceMatchTeamId,
      actingPlayerId: data.actingPlayerId,
      consequencePlayerId: data.consequencePlayerId,
      actionType: data.actionType,
      consequenceType: data.consequenceType,
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
