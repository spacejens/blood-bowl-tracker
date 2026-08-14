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
   * Upsert every declared competition. An entry that names an era has it
   * resolved against the run's ExternalIdMap; an entry that omits one passes
   * `eraId: undefined` through, so the upsert leaves the competition's stored
   * era alone — which is what a rename-only entry wants. The same applies to
   * an entry's named competition group, resolved against
   * `ctx.competitionGroupIds`: an unknown group skips the entry, while an
   * omitted one passes `competitionGroupId: undefined` through.
   * `teamEraIds` is always `[]`: manual data never declares competition/team
   * links, and the API's team-era sync is additive (it never removes existing
   * links), so an empty list leaves the competition's imported teams untouched.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.competitions) {
      const era = this.refResolver.resolveOptionalRef({
        ref: entry.era,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import competition "${entry.name ?? entry.externalIds[0].id}"`,
      });
      if (!era.ok) {
        continue;
      }
      const group = this.refResolver.resolveOptionalCompetitionGroup({
        name: entry.competitionGroup,
        groupIds: ctx.competitionGroupIds,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import competition "${entry.name ?? entry.externalIds[0].id}"`,
      });
      if (!group.ok) {
        continue;
      }
      const upserted = await this.competitionsImport.upsertCompetitionResult(
        {
          name: entry.name,
          type: entry.type,
          eraId: era.id,
          competitionGroupId: group.id,
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
