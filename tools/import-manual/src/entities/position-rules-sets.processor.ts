import type { PositionRulesSetEntry as ApiPositionRulesSetEntry } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Turns the data file's `positionRulesSets` entries into one sync call, the
 * same way SppAwardValuesProcessor does: every entry is resolved first and
 * then sent together, because the API writes the whole batch by natural key
 * in one round trip. An entry whose references do not resolve is dropped with
 * an error recorded rather than aborting the others — the same
 * one-bad-entry-does-not-stop-the-rest policy every other processor follows.
 *
 * Must run after the rulesSets and positions processors, since it references
 * rows they create.
 */
@Injectable()
export class PositionRulesSetsProcessor {
  constructor(
    private readonly positionRulesSetsImport: PositionRulesSetsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    const entries: ApiPositionRulesSetEntry[] = [];

    for (const entry of ctx.data.positionRulesSets) {
      const label = `Cannot import characteristics for position "${entry.position.id}" under rules set "${entry.rulesSet.id}"`;
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
      entries.push({
        positionId,
        rulesSetId,
        move: entry.move,
        strength: entry.strength,
        agility: entry.agility,
        // An omitted Passing means the rules set has none, which the API and
        // the database both spell as an explicit null.
        passing: entry.passing ?? null,
        armour: entry.armour,
      });
    }

    if (entries.length === 0) {
      return 0;
    }

    const result = await this.positionRulesSetsImport.syncPositionRulesSets(
      { entries },
      ctx.errors,
    );
    return result === undefined ? 0 : entries.length;
  }
}
