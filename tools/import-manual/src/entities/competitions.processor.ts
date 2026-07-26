import { CompetitionsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class CompetitionsProcessor {
  constructor(
    private readonly competitionsImport: CompetitionsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  /**
   * Upsert every declared competition, resolving its era reference against the
   * run's ExternalIdMap first. `teamEraIds` is always `[]`: manual data never
   * declares competition/team links, and the API's team-era sync is additive
   * (it never removes existing links), so an empty list leaves the
   * competition's imported teams untouched.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.competitions) {
      const label = `Cannot import competition "${entry.name}"`;
      if (entry.era === undefined) {
        // Placeholder until the conditional-resolve rework lands.
        continue;
      }
      const eraId = this.refResolver.resolveRef({
        ref: entry.era,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
      });
      if (eraId === undefined) {
        continue;
      }
      const upserted = await this.competitionsImport.upsertCompetitionResult(
        {
          name: entry.name,
          type: entry.type,
          eraId,
          teamEraIds: [],
          externalIds: this.refResolver.toExternalIds(
            entry.externalIds,
            ctx.systemIds,
          ),
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
