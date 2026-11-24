import type { DbOrTx } from '@blood-bowl-tracker/db';
import {
  and,
  eq,
  inArray,
  matches,
  matchEvents,
  matchTeams,
  max,
  min,
  or,
  sql,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type {
  DeathTimeRow,
  StatReductionEventRow,
  TeamCompetitionRow,
} from './fill-plan.types';
import type { ConsequenceRow, PlayerTeamEra } from './fill-query.types';
import {
  STAT_REDUCTION_CHARACTERISTIC,
  STAT_REDUCTION_TYPES,
  type StatReductionType,
} from './fill-query-conditions';
import { FillRowShapesService } from './fill-row-shapes.service';

/** The match-event reads about the candidates: reductions, deaths and the competitions around them. */
@Injectable()
export class CandidateMatchQueriesService {
  constructor(private readonly shapes: FillRowShapesService) {}

  async consequences(
    tx: DbOrTx,
    playerIds: number[],
  ): Promise<ConsequenceRow[]> {
    return tx
      .select({
        // Never null: the filter keeps only candidate ids.
        playerId: sql<number>`${matchEvents.consequencePlayerId}`,
        hasStatReduction: sql<boolean>`bool_or(${inArray(matchEvents.consequenceType, STAT_REDUCTION_TYPES)})`,
        hasDeath: sql<boolean>`bool_or(${eq(matchEvents.consequenceType, 'death')})`,
      })
      .from(matchEvents)
      .where(
        and(
          inArray(matchEvents.consequencePlayerId, playerIds),
          inArray(matchEvents.consequenceType, [
            ...STAT_REDUCTION_TYPES,
            'death',
          ]),
        ),
      )
      .groupBy(matchEvents.consequencePlayerId);
  }

  /**
   * For each candidate with a death match event, when the earliest such
   * match was played, unless a match played later names him in any event
   * (acting or receiving): then his death is contradicted and he gets none.
   */
  async deathTimes(tx: DbOrTx, playerIds: number[]): Promise<DeathTimeRow[]> {
    const deaths = await tx
      .select({
        playerId: sql<number>`${matchEvents.consequencePlayerId}`,
        diedAt: min(matches.playedAt),
      })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .where(
        and(
          eq(matchEvents.consequenceType, 'death'),
          inArray(matchEvents.consequencePlayerId, playerIds),
        ),
      )
      .groupBy(matchEvents.consequencePlayerId);
    const deadIds = deaths.map((death) => death.playerId);
    const appearances = await tx
      .select({
        actingPlayerId: matchEvents.actingPlayerId,
        consequencePlayerId: matchEvents.consequencePlayerId,
        lastPlayedAt: max(matches.playedAt),
      })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .where(
        or(
          inArray(matchEvents.actingPlayerId, deadIds),
          inArray(matchEvents.consequencePlayerId, deadIds),
        ),
      )
      .groupBy(matchEvents.actingPlayerId, matchEvents.consequencePlayerId);
    return deaths.flatMap((death) => {
      const diedAt = this.shapes.iso(death.diedAt);
      // ISO timestamps from toISOString compare correctly as text.
      const namedLater = appearances.some(
        (appearance) =>
          (appearance.actingPlayerId === death.playerId ||
            appearance.consequencePlayerId === death.playerId) &&
          this.shapes.iso(appearance.lastPlayedAt) > diedAt,
      );
      return namedLater ? [] : [{ playerId: death.playerId, diedAt }];
    });
  }

  async statReductionEvents(
    tx: DbOrTx,
    playerIds: number[],
  ): Promise<StatReductionEventRow[]> {
    const rows = await tx
      .select({
        playerId: sql<number>`${matchEvents.consequencePlayerId}`,
        // Always a stat-reduction type: the filter keeps only those.
        consequenceType: sql<StatReductionType>`${matchEvents.consequenceType}`,
        competitionId: matches.competitionId,
        playedAt: matches.playedAt,
      })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .where(
        and(
          inArray(matchEvents.consequencePlayerId, playerIds),
          inArray(matchEvents.consequenceType, STAT_REDUCTION_TYPES),
        ),
      );
    return rows.map((row) => ({
      playerId: row.playerId,
      characteristic: STAT_REDUCTION_CHARACTERISTIC[row.consequenceType],
      competitionId: row.competitionId,
      playedAt: this.shapes.iso(row.playedAt),
    }));
  }

  /** Every competition each player's team era played a match in, with the first and last such match. */
  async teamCompetitions(
    tx: DbOrTx,
    players: PlayerTeamEra[],
  ): Promise<TeamCompetitionRow[]> {
    const rows = await tx
      .select({
        teamEraId: matchTeams.teamEraId,
        competitionId: matches.competitionId,
        firstPlayedAt: min(matches.playedAt),
        lastPlayedAt: max(matches.playedAt),
      })
      .from(matchTeams)
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .where(
        inArray(matchTeams.teamEraId, [
          ...new Set(players.map((player) => player.teamEraId)),
        ]),
      )
      .groupBy(matchTeams.teamEraId, matches.competitionId);
    return players.flatMap((player) =>
      rows
        .filter((row) => row.teamEraId === player.teamEraId)
        .map((row) => ({
          playerId: player.playerId,
          competitionId: row.competitionId,
          firstPlayedAt: this.shapes.iso(row.firstPlayedAt),
          lastPlayedAt: this.shapes.iso(row.lastPlayedAt),
        })),
    );
  }
}
