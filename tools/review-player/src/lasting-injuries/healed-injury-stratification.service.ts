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
      .where(and(eq(playersHistory.id, players.id), this.anyInjuryInHistory()));
    const rows = await this.query
      .base(externalSystemId)
      .where(and(this.noInjury(), exists(everInjured)))
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }

  /** Every one of the seven columns at its "no injury" default. */
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
   * Any one of the seven columns away from its default, on `players_history`.
   *
   * `playersHistory`'s mirrored columns are keyed by their SQL/snake_case
   * names, not the camelCase TypeScript property names `players` uses — see
   * `historyTrackedTable` in `packages/db/src/schema/history.ts`, which builds
   * them via `Object.fromEntries(historyMirroredShapes.map((shape) => [shape.name, ...]))`.
   * The generated column map's type is an index signature, so
   * `playersHistory.missNextGame` type-checks but is `undefined` at runtime —
   * it only fails once the query actually runs. Bracket access is required
   * here; it cannot be shared with `noInjury()`'s camelCase access on
   * `players` via one generic helper. Each key is `players.<column>.name`
   * rather than a bare string literal, so the SQL name is derived from the
   * same column definition `noInjury()` uses — a rename in
   * `packages/db/src/schema/game-data/players.ts` then breaks this reference
   * at its source instead of leaving a stale literal here.
   *
   * Includes `miss_next_game` even though the one-time lasting-injury history
   * backfill (`packages/game-data/src/players/player-lasting-injury-backfill.service.ts`)
   * deliberately never manufactures miss-next-game history — only ordinary
   * imports over time write it, as a player's status changes call to call —
   * so this stratum can also surface a player whose only history-vs-current
   * difference is a cleared miss-next-game, distinct from the backfill's gap.
   */
  private anyInjuryInHistory(): SQL {
    return or(
      eq(playersHistory[players.missNextGame.name], true),
      gt(playersHistory[players.nigglingInjuryCount.name], 0),
      gt(playersHistory[players.moveReductionCount.name], 0),
      gt(playersHistory[players.strengthReductionCount.name], 0),
      gt(playersHistory[players.agilityReductionCount.name], 0),
      gt(playersHistory[players.passingReductionCount.name], 0),
      gt(playersHistory[players.armourReductionCount.name], 0),
    ) as SQL;
  }
}
