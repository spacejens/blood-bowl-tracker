import { CompetitionGroupsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class CompetitionGroupsProcessor {
  constructor(
    private readonly competitionGroupsImport: CompetitionGroupsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  /**
   * Seed the run's group name -> id map from the database, then upsert every
   * declared group.
   *
   * The seeding step is what makes classification work across import phases:
   * the catalog is curated in data/before-other-importers, but
   * data/after-other-importers/competitions.json5 -- a completely separate
   * process run with its own empty ExternalIdMap -- also has to resolve group
   * names. Reading the catalog back from the API keeps the curation in exactly
   * one file.
   *
   * A group's `league` is a normal external-id cross-reference and is required
   * (the column is NOT NULL), so an entry whose league cannot be resolved is
   * skipped with the error resolveRef already recorded.
   */
  async process(ctx: ProcessContext): Promise<number> {
    const existing = await this.competitionGroupsImport.listCompetitionGroups();
    for (const group of existing) {
      ctx.competitionGroupIds.set(group.name, group.id);
    }

    let imported = 0;
    for (const entry of ctx.data.competitionGroups) {
      const leagueId = this.refResolver.resolveRef({
        ref: entry.league,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label: `Cannot import competition group "${entry.name}"`,
      });
      if (leagueId === undefined) {
        continue;
      }
      const upserted =
        await this.competitionGroupsImport.upsertCompetitionGroup(
          { name: entry.name, leagueId },
          ctx.errors,
        );
      if (upserted) {
        ctx.competitionGroupIds.set(entry.name, upserted.id);
        imported += 1;
      }
    }
    return imported;
  }
}
