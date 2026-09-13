import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  exists,
  gt,
  or,
  players,
  playersHistory,
  sql,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const HEALED_INJURY = 'healed-injury';

/**
 * Samples players whose lasting injury has since healed: nothing outstanding
 * on the current row, but some earlier version of it carried something.
 *
 * The first consumer of a `*_history` table in this codebase. `players` is
 * history-tracked, so every write leaves a `players_history` row behind, and
 * that is the only place a healed injury survives at all — which is exactly
 * the kind of gap the TP lasting-injury history backfill step is meant to
 * fill. Without this stratum that backfill would be unobservable.
 *
 * Queried directly rather than through a shared helper because no such helper
 * exists. `packages/db` is an allowed dependency of this tool and is not one
 * of the packages the review tools must stay independent of, so this does not
 * weaken that boundary.
 *
 * No `tstzrange` predicate: the question is only "did any past version carry a
 * non-default value", which the mirrored columns answer on their own. Neither
 * `history_period` nor `history_version` is read.
 */
@Injectable()
export class HealedInjuryStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: HEALED_INJURY,
      label: 'Player had a lasting injury that has since healed',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
    @Inject(DB) private readonly db: Db,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    if (stratumId !== HEALED_INJURY) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${HEALED_INJURY}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    // Built through the query builder rather than a raw sql fragment naming
    // the history table, so drizzle registers its FROM and schema-qualifies
    // it — the same reason the characteristics stratifier builds its
    // correlated subquery this way.
    const everInjured = this.db
      .select({ id: playersHistory.id })
      .from(playersHistory)
      .where(
        and(eq(playersHistory.id, players.id), this.anyInjury(playersHistory)),
      );
    const rows = await this.query
      .base(externalSystemId)
      .where(and(this.noInjury(), exists(everInjured)))
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }

  /** Every one of the six columns at its "no injury" default. */
  private noInjury(): SQL {
    return and(
      eq(players.missNextGame, false),
      eq(players.nigglingInjuryCount, 0),
      eq(players.moveReductionCount, 0),
      eq(players.strengthReductionCount, 0),
      eq(players.agilityReductionCount, 0),
      eq(players.passingReductionCount, 0),
      eq(players.armourReductionCount, 0),
    ) as SQL;
  }

  /**
   * Any one of the six columns away from its default, on whichever table is
   * passed — `players_history` here. Taking the table as a parameter keeps the
   * history table's column set structurally tied to the tracked table's, which
   * is what `historyTrackedTable` guarantees anyway.
   */
  private anyInjury(table: typeof playersHistory): SQL {
    return or(
      eq(table.missNextGame, true),
      gt(table.nigglingInjuryCount, 0),
      gt(table.moveReductionCount, 0),
      gt(table.strengthReductionCount, 0),
      gt(table.agilityReductionCount, 0),
      gt(table.passingReductionCount, 0),
      gt(table.armourReductionCount, 0),
    ) as SQL;
  }
}
