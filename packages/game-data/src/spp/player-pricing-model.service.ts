import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  and,
  DB,
  eq,
  eraRulesSets,
  inArray,
  isNull,
  players,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { AdvancementPricingModelService } from './advancement-pricing-model.service';
import type { PricingModel } from './unspent-spp.types';

/**
 * How one player's era prices advancements, for a reader that needs only
 * that and not the whole unspent-SPP calculation: the player deepdive, which
 * flags a gained skill of unknown source only where a rolled skill and a
 * chosen one cost different amounts.
 *
 * Loads the era's rules sets and their own cost rows (no league rows: a house
 * rule adds advancements on top of a rules set's own and never decides the
 * model), then defers to `AdvancementPricingModelService`, so the answer is
 * the one `UnspentSppService` reports. `null` when the player does not exist,
 * their era lists no rules set, no rules set has costs of its own, or the
 * rules sets that have them disagree.
 */
@Injectable()
export class PlayerPricingModelService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly pricingModel: AdvancementPricingModelService,
  ) {}

  async pricingModelForPlayer(playerId: number): Promise<PricingModel | null> {
    const eraRows = await this.db
      .select({ rulesSetId: eraRulesSets.rulesSetId })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, teamEras.eraId))
      .where(eq(players.id, playerId));
    const rulesSetIds = eraRows.map((row) => row.rulesSetId);
    if (rulesSetIds.length === 0) {
      return null;
    }
    const costs = await this.db
      .select({
        rulesSetId: advancementCosts.rulesSetId,
        leagueId: advancementCosts.leagueId,
        advancementKind: advancementCosts.advancementKind,
      })
      .from(advancementCosts)
      .where(
        and(
          inArray(advancementCosts.rulesSetId, rulesSetIds),
          isNull(advancementCosts.leagueId),
        ),
      );
    return this.pricingModel.modelFor(rulesSetIds, costs);
  }
}
