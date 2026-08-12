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
import { and, eq, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const RANDOM_STRATUM = 'random';

/**
 * A plain random sample of players known to a source. Random rather than
 * newest-first: a stratum that always shows the same handful of most recent
 * players stops being a sample after the first run.
 */
@Injectable()
export class RandomPlayerStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: RANDOM_STRATUM, label: 'Random sample', sources: ['bbl', 'tp'] },
  ];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    if (stratumId !== RANDOM_STRATUM) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${RANDOM_STRATUM}.`,
      );
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
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }
}
