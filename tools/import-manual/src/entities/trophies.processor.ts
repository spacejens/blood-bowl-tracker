import { TrophiesImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class TrophiesProcessor {
  constructor(
    private readonly trophiesImport: TrophiesImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  /**
   * Upsert every declared trophy. A trophy references nothing else, so there
   * are no cross-references to resolve and no entry can be skipped for an
   * unresolved reference — the only failure mode is the upsert itself, which
   * records its own ImportError.
   *
   * An entry may declare an empty `externalIds` list; the API then matches it
   * on its exact name instead (see `TrophiesService.upsert`). Such an entry
   * records nothing in the run's ExternalIdMap, because there is no
   * external-id pair for a later entry to reference it by.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.trophies) {
      const upserted = await this.trophiesImport.upsertTrophy(
        {
          name: entry.name,
          recipientKind: entry.recipientKind,
          description: entry.description,
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
