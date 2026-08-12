import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eras,
  matchEvents,
  playerExternalIds,
  players,
  positions,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const DISCREPANCY_STRATUM = 'spp-discrepancy';

/**
 * Every player whose event-derived SPP sum disagrees with the stored
 * `players.spp_total`, including players with no stored total at all
 * (`IS DISTINCT FROM` treats NULL as a disagreement, which is what a reviewer
 * wants to see).
 *
 * Deliberately ignores the caller's `limit`: this stratum exists so a real
 * problem is never sampled away. A run against a badly-imported database can
 * therefore produce a very large report — that is the honest signal, and the
 * fix is to repair the import, not to truncate the list.
 */
@Injectable()
export class SppDiscrepancyStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: DISCREPANCY_STRATUM,
      label: 'SPP totals disagree',
      sources: ['bbl', 'tp'],
    },
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
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    if (stratumId !== DISCREPANCY_STRATUM) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${DISCREPANCY_STRATUM}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const computed = sql<number>`coalesce(sum(${matchEvents.sppValue}), 0)::int`;
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
      .leftJoin(matchEvents, eq(matchEvents.actingPlayerId, players.id))
      .groupBy(
        players.id,
        players.name,
        players.sppTotal,
        playerExternalIds.externalId,
        teams.name,
        positions.name,
        eras.name,
      )
      .having(sql`${computed} is distinct from ${players.sppTotal}`)
      .orderBy(asc(players.name), asc(players.id));
    return rows.map((row) => ({ source, ...row }));
  }
}
