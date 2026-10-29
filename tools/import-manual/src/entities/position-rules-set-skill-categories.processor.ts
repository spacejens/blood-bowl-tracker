import { PositionRulesSetSkillCategoriesImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Turns each curated `positionRulesSetSkillCategories` entry into one sync
 * call, one per (position, rules set), so a rejected pair costs no other pair
 * its categories. Each entry is the pair's complete set.
 *
 * Must run after the rulesSets, positions and positionRulesSets processors:
 * the API rejects categories for a position with no characteristics under
 * that rules set.
 */
@Injectable()
export class PositionRulesSetSkillCategoriesProcessor {
  constructor(
    private readonly categoriesImport: PositionRulesSetSkillCategoriesImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.positionRulesSetSkillCategories) {
      const label = `Cannot import skill categories for position "${entry.position.id}" under rules set "${entry.rulesSet.id}"`;
      const positionId = await this.refResolver.resolveRef({
        ref: entry.position,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'position',
      });
      if (positionId === undefined) {
        continue;
      }
      const rulesSetId = await this.refResolver.resolveRef({
        ref: entry.rulesSet,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'rulesSet',
      });
      if (rulesSetId === undefined) {
        continue;
      }
      const result =
        await this.categoriesImport.syncPositionRulesSetSkillCategories(
          {
            entries: [
              {
                positionId,
                rulesSetId,
                primary: entry.primary,
                secondary: entry.secondary,
              },
            ],
          },
          ctx.errors,
        );
      if (result !== undefined) {
        imported += 1;
      }
    }
    return imported;
  }
}
