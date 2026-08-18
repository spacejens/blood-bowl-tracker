import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  playerExternalIds,
  players,
  positions,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const STAR_PLAYER_STRATUM = 'star-players';

/**
 * A random sample of star players, kept in its own bounded stratum rather
 * than mixed into the regular random sample: a popular star gets induced by
 * many teams, so today's data model gives them one `players` row per hire
 * (see issue #245) — if left in the general pool they crowd out ordinary
 * players in a report several-fold. The random-sample stratum excludes star
 * players outright, and the discrepancy stratum excludes a star player with
 * no stored total; this is the only stratum such a player appears in, and —
 * unlike the discrepancy stratum — this one obeys `limit`, since an
 * uncapped star-player stratum would reintroduce the same overrepresentation
 * it exists to avoid. Since #245 the sample is also deduped to one representative
 * players row per distinct positions.id — a star's identity — so one named star
 * can never occupy several slots of one run.
 */
@Injectable()
export class StarPlayerStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: STAR_PLAYER_STRATUM, label: 'Star players', sources: ['bbl', 'tp'] },
  ];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    if (stratumId !== STAR_PLAYER_STRATUM) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${STAR_PLAYER_STRATUM}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    // One representative hire per named star: group by the star's identity
    // (players.position_id), pick the lowest player id the requested source
    // actually knows about, and randomise across stars — not across hires,
    // which is what let one star fill several slots before #245.
    const representatives = await this.db
      .select({ playerId: sql<number>`min(${players.id})::int` })
      .from(players)
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(
        playerExternalIds,
        and(
          eq(playerExternalIds.playerId, players.id),
          eq(playerExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .where(eq(positions.isStarPlayer, true))
      .groupBy(players.positionId)
      .orderBy(sql`random()`)
      .limit(limit);

    const playerIds = representatives.map((row) => row.playerId);
    if (playerIds.length === 0) {
      return [];
    }

    const rows = await this.query
      .base(externalSystemId)
      .where(inArray(players.id, playerIds));
    // The projection joins players_external_ids, so a player carrying two ids
    // in the same system (an induced star has both its TP player id and a
    // star-<roster>-<lineUpMaster> id) comes back twice.
    const seen = new Set<number>();
    return rows
      .filter((row) => {
        if (seen.has(row.playerId)) {
          return false;
        }
        seen.add(row.playerId);
        return true;
      })
      .map((row) => ({ source, ...row }));
  }
}
