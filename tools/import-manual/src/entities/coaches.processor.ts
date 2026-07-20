import { CoachesImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { toExternalIds } from '../references/resolve-refs';

@Injectable()
export class CoachesProcessor {
  constructor(private readonly coachesImport: CoachesImportService) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.coaches) {
      const upserted = await this.coachesImport.upsertCoach(
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
