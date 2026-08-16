import { ErasImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class ErasProcessor {
  constructor(
    private readonly erasImport: ErasImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.eras) {
      const label = `Cannot import era "${entry.name}"`;
      // Both are resolved before either is checked, so one entry with two bad
      // references still records both errors -- the behaviour the old code had.
      const league = await this.refResolver.resolveOptionalRef({
        ref: entry.league,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'league',
      });
      // The rules-set list defaults to [], and the API's sync is additive, so
      // an omitted list resolves to [] and changes nothing -- no conditional
      // needed here, unlike the single-ref league above.
      const rulesSetIds = await this.refResolver.resolveRefs({
        refs: entry.rulesSets,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'rulesSet',
      });
      if (!league.ok || rulesSetIds === undefined) {
        continue;
      }
      const upserted = await this.erasImport.upsertEra(
        {
          name: entry.name,
          leagueId: league.id,
          rulesSetIds,
          startDate: entry.startDate,
          endDate: entry.endDate,
          externalIds: this.refResolver.toExternalIds(
            entry.externalIds,
            ctx.systemIds,
          ),
        },
        ctx.errors,
      );
      if (upserted) {
        imported += 1;
      }
    }
    return imported;
  }
}
