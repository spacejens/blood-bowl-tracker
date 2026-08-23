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
   * Upsert every declared trophy. A trophy names either the competition group
   * it belongs to or the league it is awarded across, by an explicit
   * external-id pair resolved against the database through the API's resolve
   * procedure like any other cross-reference; an entry naming an unknown
   * group or league is skipped (an authoring error), an omitted reference
   * passes `undefined` through leaving the stored value alone, and an entry
   * supplying neither or both is caught by the database's check constraint
   * at write time rather than here.
   *
   * An entry may declare an empty `externalIds` list; the API then matches it
   * on its exact name instead (see `TrophiesService.upsert`).
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.trophies) {
      const group = await this.refResolver.resolveOptionalRef({
        ref: entry.competitionGroup,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import trophy "${entry.name}"`,
        kind: 'competitionGroup',
      });
      if (!group.ok) {
        continue;
      }
      const league = await this.refResolver.resolveOptionalRef({
        ref: entry.league,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import trophy "${entry.name}"`,
        kind: 'league',
      });
      if (!league.ok) {
        continue;
      }
      const upserted = await this.trophiesImport.upsertTrophy(
        {
          name: entry.name,
          recipientKind: entry.recipientKind,
          description: entry.description,
          competitionGroupId: group.id,
          leagueId: league.id,
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
