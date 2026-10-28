import type { AdvancementCostEntry as ApiAdvancementCostEntry } from '@blood-bowl-tracker/api-contract';
import { AdvancementCostsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

type AdvancementCostDataEntry = ManualDataFile['advancementCosts'][number];

/**
 * Turns the data file's `advancementCosts` entries into one sync call. Every
 * entry is resolved first and the resolved costs are sent together, the same
 * way SppAwardValuesProcessor does: an entry whose rules set, league or
 * skill does not resolve is dropped with an error recorded, without stopping
 * the others. A league or skill the entry omits stays absent from its cost.
 *
 * Must run after the rulesSets, leagues and skills processors, since it
 * references rows they create.
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
      const cost = await this.resolveEntry(ctx, entry);
      if (cost !== undefined) {
        costs.push(cost);
      }
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

  /** The entry as an API cost, or undefined when a reference fails to resolve. */
  private async resolveEntry(
    ctx: ProcessContext,
    entry: AdvancementCostDataEntry,
  ): Promise<ApiAdvancementCostEntry | undefined> {
    const common = {
      systemIds: ctx.systemIds,
      errors: ctx.errors,
      item: entry,
      label: `Cannot import advancement cost for advancement ${entry.advancementNumber} (${entry.advancementKind})`,
    };
    const rulesSetId = await this.refResolver.resolveRef({
      ...common,
      ref: entry.rulesSet,
      kind: 'rulesSet',
    });
    if (rulesSetId === undefined) {
      return undefined;
    }
    const league = await this.refResolver.resolveOptionalRef({
      ...common,
      ref: entry.league,
      kind: 'league',
    });
    if (!league.ok) {
      return undefined;
    }
    const skill = await this.refResolver.resolveOptionalRef({
      ...common,
      ref: entry.skill,
      kind: 'skill',
    });
    if (!skill.ok) {
      return undefined;
    }
    return {
      rulesSetId,
      ...(league.id === undefined ? {} : { leagueId: league.id }),
      advancementNumber: entry.advancementNumber,
      advancementKind: entry.advancementKind,
      ...(skill.id === undefined ? {} : { skillId: skill.id }),
      sppCost: entry.sppCost,
    };
  }
}
