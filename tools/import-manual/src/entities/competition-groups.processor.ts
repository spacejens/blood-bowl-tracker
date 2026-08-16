import {
  CompetitionGroupsImportService,
  NAME_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/import';
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
   * Upsert every declared group, exactly like every other before-other-importers
   * processor: resolve its cross-references, upsert, then register the result in
   * the run's ExternalIdMap so later entries can reference it.
   *
   * A group's own external id is not authored in the data file -- it is derived
   * in code from the group's name under the synthetic "Name" system, the same
   * way BblLeaguesImportService derives a league's. Because that id is the
   * same every run, the upsert is idempotent and a phase that re-processes
   * the catalog re-resolves the very same rows rather than duplicating them.
   * The catalog is curated once, in data/before-other-importers, alongside
   * the competitions that classify into it.
   *
   * A group's `league` is a normal external-id cross-reference and is required
   * (the column is NOT NULL), so an entry whose league cannot be resolved is
   * skipped with the error resolveRef already recorded.
   *
   * The "Name" system bootstrap check runs once, before the per-entry loop,
   * rather than per-entry after resolving `league`: it's the same answer on
   * every entry, and checking it first means a data file that never declares
   * the "Name" system surfaces that root cause immediately instead of a
   * confusing "unknown league" error from the first entry.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    if (ctx.data.competitionGroups.length === 0) {
      return imported;
    }
    const nameSystemId = ctx.systemIds.get(NAME_EXTERNAL_SYSTEM_NAME);
    if (nameSystemId === undefined) {
      throw new Error(
        `External system "${NAME_EXTERNAL_SYSTEM_NAME}" is required to import competition groups but was not bootstrapped; declare it in the data file's externalSystems.`,
      );
    }
    for (const entry of ctx.data.competitionGroups) {
      const label = `Cannot import competition group "${entry.name}"`;
      const leagueId = this.refResolver.resolveRef({
        ref: entry.league,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
      });
      if (leagueId === undefined) {
        continue;
      }
      const ref = this.refResolver.competitionGroupRef(entry.name);
      const upserted =
        await this.competitionGroupsImport.upsertCompetitionGroup(
          {
            name: entry.name,
            leagueId,
            externalIds: [
              { externalSystemId: nameSystemId, externalId: ref.id },
            ],
          },
          ctx.errors,
        );
      if (upserted) {
        ctx.idMap.add([ref], upserted.id);
        imported += 1;
      }
    }
    return imported;
  }
}
