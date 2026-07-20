import { RulesSetsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { toExternalIds } from '../references/resolve-refs';

@Injectable()
export class RulesSetsProcessor {
  constructor(private readonly rulesSetsImport: RulesSetsImportService) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.rulesSets) {
      const upserted = await this.rulesSetsImport.upsertRulesSet(
        {
          name: entry.name,
          externalIds: toExternalIds(entry.externalIds, ctx.systemIds),
        },
        ctx.errors,
      );
      if (upserted) {
        ctx.idMap.add(entry.externalIds, upserted.id);
        imported += 1;
      }
    }
    return imported;
  }
}
