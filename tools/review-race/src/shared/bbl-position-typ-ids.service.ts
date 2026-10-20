import { BBL_EXTERNAL_SYSTEM_NAME } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { PositionExternalIdsService } from './position-external-ids.service';
import { RacePositionsQueryService } from './race-positions-query.service';

/**
 * Stored position name -> BBL typID, from each position's
 * `"<typId>-<raceBblId>"` external id. Split on the first `-` only: the race
 * half is what follows, and neither half is guaranteed hyphen-free.
 *
 * Shared by the position-availability and position-characteristics raw
 * renderers, which both need the same mapping for the same race.
 */
@Injectable()
export class BblPositionTypIdsService {
  constructor(
    private readonly query: RacePositionsQueryService,
    private readonly positionIds: PositionExternalIdsService,
  ) {}

  async forRace(raceId: number): Promise<Map<string, string>> {
    const positions = await this.query.positionsFor(raceId);
    const byPosition = await this.positionIds.forPositions(
      positions.map((position) => position.positionId),
    );
    const typIds = new Map<string, string>();
    for (const position of positions) {
      const external = (byPosition.get(position.positionId) ?? []).find(
        (row) => row.systemName === BBL_EXTERNAL_SYSTEM_NAME,
      );
      if (external === undefined || !external.externalId.includes('-')) {
        continue;
      }
      const typId = external.externalId.split('-')[0];
      if (typId !== undefined && typId !== '') {
        typIds.set(position.positionName, typId);
      }
    }
    return typIds;
  }
}
