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

    const values = {
      matchId: data.matchId,
      actingMatchTeamId: actingMatchTeamId ?? null,
      consequenceMatchTeamId: consequenceMatchTeamId ?? null,
      actingPlayerId: data.actingPlayerId ?? null,
      consequencePlayerId: data.consequencePlayerId ?? null,
      actionType: data.actionType ?? null,
      consequenceType: data.consequenceType ?? null,
      eventType: data.eventType ?? null,
      weatherType: data.weatherType ?? null,
      inducementsCost: data.inducementsCost ?? null,
      inducementsFromTreasury: data.inducementsFromTreasury ?? null,
      winnings: data.winnings ?? null,
      fanFactor: data.fanFactor ?? null,
      journeymenCount: data.journeymenCount ?? null,
      prayersToNuffle: data.prayersToNuffle ?? null,
      dedicatedFans: data.dedicatedFans ?? null,
      secretObjective: data.secretObjective ?? null,
      expensiveMistake: data.expensiveMistake ?? null,
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
