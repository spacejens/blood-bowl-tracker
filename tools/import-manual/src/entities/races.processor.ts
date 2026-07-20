import { RacesImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { resolveRefs, toExternalIds } from '../references/resolve-refs';

@Injectable()
export class RacesProcessor {
  constructor(private readonly racesImport: RacesImportService) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.races) {
      const eras = resolveRefs({
        refs: entry.eras,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import race "${entry.name}"`,
      });
      if (eras === undefined) {
        continue;
      }
      const upserted = await this.racesImport.upsertRace(
        {
          name: entry.name,
          eras,
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
