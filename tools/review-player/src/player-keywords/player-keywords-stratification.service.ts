import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  isNull,
  players,
  positionRulesSetKeywords,
  positionRulesSets,
  rulesSets,
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

const BB2025_PLAYER = 'bb2025-player-position-without-keywords';

/** The rules set whose name marks a `position_rules_sets` row as BB2025. */
const BB2025_RULES_SET_NAME = 'BB2025';

/**
 * A player whose position has a BB2025 `position_rules_sets` row with no
 * matching `position_rules_set_keywords` row -- the closest DB-visible
 * signal that a keyword was dropped. "BB2025" is resolved by the rules set's
 * own name, never a hard-coded id. A stratifier only ever sees the database,
 * so "differs from TP" cannot itself be a stratum here.
 */
@Injectable()
export class PlayerKeywordsStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: BB2025_PLAYER,
      label: 'Player whose position has no keyword recorded under BB2025',
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
    if (stratumId !== BB2025_PLAYER) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${BB2025_PLAYER}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const rows = await this.query
      .base(externalSystemId)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.positionId, players.positionId),
      )
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .leftJoin(
        positionRulesSetKeywords,
        eq(positionRulesSetKeywords.positionRulesSetId, positionRulesSets.id),
      )
      .where(
        and(
          eq(rulesSets.name, BB2025_RULES_SET_NAME),
          isNull(positionRulesSetKeywords.id),
        ),
      )
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }
}
