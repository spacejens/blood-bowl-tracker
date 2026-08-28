import { RacesImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class RacesProcessor {
  constructor(
    private readonly racesImport: RacesImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.races) {
      const eras = await this.refResolver.resolveRefs({
        refs: entry.eras,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import race "${entry.name}"`,
        kind: 'era',
      });
      if (eras === undefined) {
        continue;
      }
      const upserted = await this.racesImport.upsert(
        {
          name: entry.name,
          eras,
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
