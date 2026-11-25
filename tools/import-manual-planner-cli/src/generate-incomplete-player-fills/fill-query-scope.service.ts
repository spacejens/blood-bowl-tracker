import type { SQL } from '@blood-bowl-tracker/db';
import { externalSystems, sql } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import type { TeamPlayerRow } from './fill-plan.types';
import type {
  CandidateScope,
  CandidateScopeRow,
  PositionEra,
  PositionEraColumns,
  TeamPlayerScope,
} from './fill-query.types';

/**
 * The ids the fill queries filter by, taken from the rows earlier queries
 * returned (the candidates, then their team players), and the SQL fragments
 * that filter by them. Passing ids keeps every query a flat select inside
 * the one snapshot transaction.
 */
@Injectable()
export class FillQueryScopeService {
  candidateScope(candidates: readonly CandidateScopeRow[]): CandidateScope {
    return {
      rows: candidates.map(({ teamEraId: _teamEraId, ...row }) => row),
      playerIds: candidates.map((candidate) => candidate.playerId),
      teamIds: this.unique(candidates.map((candidate) => candidate.teamId)),
      positionIds: this.unique(
        candidates.map((candidate) => candidate.positionId),
      ),
      positionEras: this.positionEras(candidates),
      playerTeamEras: candidates.map((candidate) => ({
        playerId: candidate.playerId,
        teamEraId: candidate.teamEraId,
      })),
    };
  }

  teamPlayerScope(teamPlayers: readonly TeamPlayerRow[]): TeamPlayerScope {
    return {
      playerIds: teamPlayers.map((player) => player.playerId),
      eraIds: this.unique(teamPlayers.map((player) => player.eraId)),
      positionEras: this.positionEras(teamPlayers),
    };
  }

  /** `(position, era) IN (...)` over the two columns; matches nothing when there are no pairs. */
  positionEraIn(
    columns: PositionEraColumns,
    pairs: readonly PositionEra[],
  ): SQL {
    if (pairs.length === 0) {
      return sql`false`;
    }
    const rows = pairs.map((pair) => sql`(${pair.positionId}, ${pair.eraId})`);
    return sql`(${columns.position}, ${columns.era}) in (${sql.join(rows, sql`, `)})`;
  }

  /** The id of the external system with this name, as a scalar subquery. */
  externalSystemId(name: string): SQL {
    return sql`(select ${externalSystems.id} from ${externalSystems} where ${externalSystems.name} = ${name})`;
  }

  private unique(values: readonly number[]): number[] {
    return [...new Set(values)];
  }

  private positionEras(rows: readonly PositionEra[]): PositionEra[] {
    const byKey = new Map<string, PositionEra>();
    for (const row of rows) {
      byKey.set(`${row.positionId}:${row.eraId}`, {
        positionId: row.positionId,
        eraId: row.eraId,
      });
    }
    return [...byKey.values()];
  }
}
