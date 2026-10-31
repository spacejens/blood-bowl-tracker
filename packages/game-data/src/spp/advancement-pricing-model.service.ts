import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type { PricingModel } from './unspent-spp.types';

/** The fields of an `advancement_costs` row the pricing model looks at. */
export interface PricedCostRow {
  rulesSetId: number;
  leagueId: number | null;
  advancementKind: AdvancementKind;
}

/**
 * How the rules sets of an era price advancements. A rules set whose own
 * rows (those with no league) are all `table_roll` uses fixed thresholds;
 * any other kind among them means it prices by kind. League rows never
 * decide it: a house rule adds advancements on top of the rules set's own.
 * A rules set with no own rows abstains, and the era has a model only when
 * every rules set that has one agrees.
 */
@Injectable()
export class AdvancementPricingModelService {
  modelFor(
    rulesSetIds: readonly number[],
    costs: readonly PricedCostRow[],
  ): PricingModel | null {
    const models = new Set<PricingModel>();
    for (const rulesSetId of rulesSetIds) {
      const own = costs.filter(
        (cost) => cost.rulesSetId === rulesSetId && cost.leagueId === null,
      );
      if (own.length === 0) {
        continue;
      }
      models.add(
        own.every((cost) => cost.advancementKind === 'table_roll')
          ? 'fixed_threshold'
          : 'kind_priced',
      );
    }
    const distinct = [...models];
    return distinct.length === 1 ? distinct[0] : null;
  }
}
