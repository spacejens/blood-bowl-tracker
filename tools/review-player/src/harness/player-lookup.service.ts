import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eras,
  playerExternalIds,
  players,
  positions,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { ReviewPlayer, ReviewSource } from '../shared/review.types';

/**
 * Resolves a source's own player ids (BBL's `pid`, TP's line-up `id`) to the
 * database players the report covers. Used for the config's pinned overrides;
 * strata do their own, wider queries.
 */
@Injectable()
export class PlayerLookupService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
  ) {}

  async findByExternalIds(
    source: ReviewSource,
    externalIds: string[],
  ): Promise<ReviewPlayer[]> {
    if (externalIds.length === 0) {
      return [];
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.db
      .select({
        playerId: players.id,
        externalId: playerExternalIds.externalId,
        playerName: players.name,
        teamName: teams.name,
        positionName: positions.name,
        eraName: eras.name,
      })
      .from(players)
      .innerJoin(
        playerExternalIds,
        and(
          eq(playerExternalIds.playerId, players.id),
          eq(playerExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(inArray(playerExternalIds.externalId, externalIds));
    return rows.map((row) => ({ source, ...row }));
  }
}
