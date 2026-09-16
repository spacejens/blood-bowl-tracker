import type { PositionRulesSetSkillEntry } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetSkillsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Turns each curated `positionRulesSetSkills` entry into one sync call -- one
 * per (position, rules set) rather than one for the whole file, because the
 * API rejects a batch all-or-nothing: a single unavailable skill would
 * otherwise cost every other position its starting skills too.
 *
 * Must run after the rulesSets, positions, skills, skillRulesSets and
 * positionRulesSets processors: the API rejects a starting skill whose
 * position has no characteristics under that rules set, and one whose skill
 * has no category row there.
 */
@Injectable()
export class PositionRulesSetSkillsProcessor {
  constructor(
    private readonly positionRulesSetSkillsImport: PositionRulesSetSkillsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;

    for (const entry of ctx.data.positionRulesSetSkills) {
      const label = `Cannot import starting skills for position "${entry.position.id}" under rules set "${entry.rulesSet.id}"`;
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
      // All-or-nothing on purpose: the API would reject the batch anyway, so
      // an unresolvable skill drops this position's whole entry with its own
      // recorded error rather than sending a half-list that looks complete.
      const skillIds = await this.refResolver.resolveRefs({
        refs: entry.skills,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'skill',
      });
      if (skillIds === undefined) {
        continue;
      }

      const entries: PositionRulesSetSkillEntry[] = skillIds.map((skillId) => ({
        positionId,
        rulesSetId,
        skillId,
      }));
      const result =
        await this.positionRulesSetSkillsImport.syncPositionRulesSetSkills(
          { entries },
          ctx.errors,
        );
      if (result !== undefined) {
        imported += entries.length;
      }
    }

    return imported;
  }
}
