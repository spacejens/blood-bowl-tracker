import { ErasImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { resolveRef, resolveRefs, toExternalIds } from '../references/resolve-refs';

@Injectable()
export class ErasProcessor {
  constructor(private readonly erasImport: ErasImportService) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.eras) {
      const label = `Cannot import era "${entry.name}"`;
      const leagueId = resolveRef({
        ref: entry.league,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
      });
      const rulesSetIds = resolveRefs({
        refs: entry.rulesSets,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
      });
      if (leagueId === undefined || rulesSetIds === undefined) {
        continue;
      }
      const upserted = await this.erasImport.upsertEra(
        {
          name: entry.name,
          leagueId,
          rulesSetIds,
          startDate: entry.startDate,
          endDate: entry.endDate,
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
