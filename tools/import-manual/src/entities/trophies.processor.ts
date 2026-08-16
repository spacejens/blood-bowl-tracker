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
   * Upsert every declared trophy. A trophy may name the competition group it
   * belongs to by an explicit external-id pair, resolved against the run's
   * ExternalIdMap like any other cross-reference; an entry naming an unknown
   * group is skipped (an authoring error), while an entry that omits one
   * passes `competitionGroupId: undefined` through, leaving the trophy's
   * stored group alone.
   *
   * An entry may declare an empty `externalIds` list; the API then matches it
   * on its exact name instead (see `TrophiesService.upsert`). Such an entry
   * records nothing in the run's ExternalIdMap, because there is no
   * external-id pair for a later entry to reference it by.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.trophies) {
      const group = this.refResolver.resolveOptionalRef({
        ref: entry.competitionGroup,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import trophy "${entry.name}"`,
        kind: 'competitionGroup',
      });
      if (!group.ok) {
        continue;
      }
      const upserted = await this.trophiesImport.upsertTrophy(
        {
          name: entry.name,
          recipientKind: entry.recipientKind,
          description: entry.description,
          competitionGroupId: group.id,
          externalIds: this.refResolver.toExternalIds(
            entry.externalIds,
            ctx.systemIds,
          ),
        },
        ctx.errors,
      );
      if (upserted) {
        ctx.idMap.add(entry.externalIds, upserted.id, 'trophy');
        imported += 1;
      }
    }
    return imported;
  }
}
