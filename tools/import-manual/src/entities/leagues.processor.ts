import { LeaguesImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class LeaguesProcessor {
  constructor(
    private readonly leaguesImport: LeaguesImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.leagues) {
      const upserted = await this.leaguesImport.upsertLeague(
        {
          name: entry.name,
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
