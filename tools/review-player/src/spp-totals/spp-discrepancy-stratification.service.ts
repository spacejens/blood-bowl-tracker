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
 * Every player whose event-derived SPP sum — plus `players.spp_adjustment`,
 * per `packages/game-data`'s `SppAdjustmentsService` invariant that
 * `spp_total` is the event sum adjusted by that column — disagrees with the
 * stored `players.spp_total`. Comparing the raw event sum instead would flag
 * almost every experienced player, since a nonzero adjustment is the normal
 * case, not a data problem. Includes players with no stored total at all
 * (`IS DISTINCT FROM` treats NULL as a disagreement, which is what a reviewer
 * wants to see): the adjusted sum is always a non-null number thanks to the
 * `coalesce`s on both terms, so `IS DISTINCT FROM` against a NULL
 * `spp_total` is guaranteed true by standard SQL semantics.
 *
 * Deliberately ignores the caller's `limit`: this stratum exists so a real
 * problem is never sampled away. A run against a badly-imported database can
 * therefore produce a very large report — that is the honest signal, and the
 * fix is to repair the import, not to truncate the list.
 *
 * Excludes star players: an induced star player has no source-reported SPP
 * total at all (`spp_total` is always NULL for them), so every one of them
 * would always disagree — that's the expected, unavoidable state for a star
 * player, not a real discrepancy worth an uncapped stratum flooding the
 * report with. `StarPlayerStratificationService` covers star players
 * separately, in their own bounded stratum (see issue #245).
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
    const adjustedComputed = sql<number>`${computed} + coalesce(${players.sppAdjustment}, 0)`;
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
      .where(eq(positions.isStarPlayer, false))
      .groupBy(
        players.id,
        players.name,
        players.sppTotal,
        players.sppAdjustment,
        playerExternalIds.externalId,
        teams.name,
        positions.name,
        eras.name,
      )
      .having(sql`${adjustedComputed} is distinct from ${players.sppTotal}`)
      .orderBy(asc(players.name), asc(players.id));
    return rows.map((row) => ({ source, ...row }));
  }
}
