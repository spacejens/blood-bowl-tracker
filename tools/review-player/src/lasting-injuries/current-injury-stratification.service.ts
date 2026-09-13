import type { SQL } from '@blood-bowl-tracker/db';
import { eq, gt, or, players, sql } from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const CURRENTLY_INJURED = 'currently-injured';

/**
 * Samples players who currently carry a lasting injury of any kind.
 *
 * Bounded by `playersPerStratum` like the other sampling strata: an injured
 * player is not a finding on its own — most of them are correctly imported —
 * so this exists to guarantee a run always contains players whose
 * lasting-injury columns are non-default, which is where a mis-parsed BBL
 * injury line or a mis-signed TP template diff actually shows up. A run over a
 * healthy league would otherwise show nothing but zeroes.
 */
@Injectable()
export class CurrentInjuryStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: CURRENTLY_INJURED,
      label: 'Player currently has a lasting injury',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
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
    if (stratumId !== CURRENTLY_INJURED) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${CURRENTLY_INJURED}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .where(this.anyInjury())
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }

  /** Any one of the seven columns away from its "no injury" default. */
  private anyInjury(): SQL {
    return or(
      eq(players.missNextGame, true),
      gt(players.nigglingInjuryCount, 0),
      gt(players.moveReductionCount, 0),
      gt(players.strengthReductionCount, 0),
      gt(players.agilityReductionCount, 0),
      gt(players.passingReductionCount, 0),
      gt(players.armourReductionCount, 0),
    ) as SQL;
  }
}
