import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/api-contract';
import type { Db, MatchEvent } from '@blood-bowl-tracker/db';
import {
  DB,
  matchEventExternalIds,
  matchEvents,
  matchTeams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class MatchEventUpsertConflictError extends Error {}

export interface UpsertMatchEventData {
  matchId: number;
  actingTeamEraId?: number;
  consequenceTeamEraId?: number;
  actingPlayerId?: number;
  consequencePlayerId?: number;
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class MatchEventsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertMatchEventData,
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

    const { ownerIds, existingRows } = await resolveExistingByExternalIds(
      this.db,
      matchEventExternalIds,
      matchEventExternalIds.matchEventId,
      matchEventExternalIds.externalSystemId,
      matchEventExternalIds.externalId,
      data.externalIds,
    );
    if (ownerIds.length > 1) {
      throw new MatchEventUpsertConflictError(
        `External IDs matched multiple existing match events: ${ownerIds.join(', ')}`,
      );
    }

    const values = {
      matchId: data.matchId,
      actingMatchTeamId: actingMatchTeamId ?? null,
      consequenceMatchTeamId: consequenceMatchTeamId ?? null,
      actingPlayerId: data.actingPlayerId ?? null,
      consequencePlayerId: data.consequencePlayerId ?? null,
      actionType: data.actionType ?? null,
      consequenceType: data.consequenceType ?? null,
    };

    let matchEvent: MatchEvent;
    const created = ownerIds.length === 0;
    if (created) {
      const result = await this.db
        .insert(matchEvents)
        .values(values)
        .returning();
      matchEvent = result[0];
    } else {
      const result = await this.db
        .update(matchEvents)
        .set(values)
        .where(eq(matchEvents.id, ownerIds[0]))
        .returning();
      matchEvent = result[0];
    }

    await insertMissingExternalIds(
      this.db,
      matchEventExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ matchEventId: matchEvent.id, ...pair }),
    );

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
