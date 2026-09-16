import type { SkillRulesSetEntry as ApiSkillRulesSetEntry } from '@blood-bowl-tracker/api-contract';
import { SkillRulesSetsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Turns the data file's `skillRulesSets` entries into one sync call, exactly
 * as PositionRulesSetsProcessor does for characteristics: every entry is
 * resolved first and then sent together, because the API writes the whole
 * batch by natural key in one round trip. An entry whose references do not
 * resolve is dropped with an error recorded rather than aborting the others.
 *
 * Must run after the rulesSets and skills processors, since its entries
 * reference rows they create.
 */
@Injectable()
export class SkillRulesSetsProcessor {
  constructor(
    private readonly skillRulesSetsImport: SkillRulesSetsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    const entries: ApiSkillRulesSetEntry[] = [];

    for (const entry of ctx.data.skillRulesSets) {
      const label = `Cannot import category for skill "${entry.skill.id}" under rules set "${entry.rulesSet.id}"`;
      const skillId = await this.refResolver.resolveRef({
        ref: entry.skill,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'skill',
      });
      if (skillId === undefined) {
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
      entries.push({ skillId, rulesSetId, category: entry.category });
    }

    if (entries.length === 0) {
      return 0;
    }

    const result = await this.skillRulesSetsImport.syncSkillRulesSets(
      { entries },
      ctx.errors,
    );
    return result === undefined ? 0 : entries.length;
  }
}
