import type { AdvancementCostEntry as ApiAdvancementCostEntry } from '@blood-bowl-tracker/api-contract';
import { AdvancementCostsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Turns the data file's `advancementCosts` entries into one sync call. Every
 * entry is resolved first and the resolved costs are sent together, the same
 * way SppAwardValuesProcessor does: an entry whose rules set does not resolve
 * is dropped with an error recorded, without stopping the others.
 *
 * Must run after the rulesSets processor, since it references rows it
 * creates.
 */
@Injectable()
export class AdvancementCostsProcessor {
  constructor(
    private readonly advancementCostsImport: AdvancementCostsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    const costs: ApiAdvancementCostEntry[] = [];

    for (const entry of ctx.data.advancementCosts) {
      const rulesSetId = await this.refResolver.resolveRef({
        ref: entry.rulesSet,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import advancement cost for advancement ${entry.advancementNumber} (${entry.advancementKind})`,
        kind: 'rulesSet',
      });
      if (rulesSetId === undefined) {
        continue;
      }
      costs.push({
        rulesSetId,
        advancementNumber: entry.advancementNumber,
        advancementKind: entry.advancementKind,
        sppCost: entry.sppCost,
      });
    }

    if (costs.length === 0) {
      return 0;
    }

    const result = await this.advancementCostsImport.syncAdvancementCosts(
      { costs },
      ctx.errors,
    );
    return result === undefined ? 0 : costs.length;
  }
}
