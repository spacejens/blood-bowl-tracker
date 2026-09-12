import {
  ImportResultService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class TrophyAwardsProcessor {
  constructor(
    private readonly trophyAwardsImport: TrophyAwardsImportService,
    private readonly trophiesImport: TrophiesImportService,
    private readonly refResolver: ReferenceResolverService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Record every hand-curated trophy award. These exist only for trophies
   * classified `manual` in `before-other-importers/trophies.json5`, whose
   * winner no statistic determines and no source records.
   *
   * Three lookups per entry, each of which skips the entry (with one
   * ImportError) when it fails: the trophy by its exact curated *name* (see
   * `TrophiesImportService.resolveByName` for why not by external id), and
   * the competition and player by external id like every other
   * cross-reference in this tool.
   *
   * No `teamEraId` is sent: a player never changes teams, so the API derives
   * the award's team era from the resolved player's own row.
   */
  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.trophyAwards) {
      const label = `Cannot import award of trophy "${entry.trophy}"`;
      const trophyId = await this.trophiesImport.resolveByName(
        entry.trophy,
        ctx.errors,
      );
      if (trophyId === undefined) {
        // Phrased as the *entry's* failure, in the curator's own terms. A
        // failed RPC call has already recorded its own diagnostic inside
        // resolveByName, so that case yields two errors -- the cause and this
        // consequence -- exactly as an unresolved reference does elsewhere.
        ctx.errors.push(
          this.importResults.error({
            item: entry,
            message:
              `${label}: no trophy is named "${entry.trophy}" (or more ` +
              'than one is).',
          }),
        );
        continue;
      }
      const competitionId = await this.refResolver.resolveRef({
        ref: entry.competition,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'competition',
      });
      if (competitionId === undefined) {
        continue;
      }
      const playerId = await this.refResolver.resolveRef({
        ref: entry.player,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'player',
      });
      if (playerId === undefined) {
        continue;
      }
      const upserted = await this.trophyAwardsImport.upsert(
        { trophyId, competitionId, playerId },
        ctx.errors,
      );
      if (upserted) {
        imported += 1;
      }
    }
    return imported;
  }
}
