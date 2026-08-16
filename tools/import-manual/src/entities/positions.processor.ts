import type { SyncPositionRaceErasData } from '@blood-bowl-tracker/import';
import { PositionsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { PositionEntry } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class PositionsProcessor {
  constructor(
    private readonly positionsImport: PositionsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.positions) {
      const upserted = await this.positionsImport.upsertPosition(
        {
          name: entry.name,
          isStarPlayer: entry.isStarPlayer,
          externalIds: this.refResolver.toExternalIds(
            entry.externalIds,
            ctx.systemIds,
          ),
        },
        ctx.errors,
      );
      if (!upserted) {
        continue;
      }
      ctx.idMap.add(entry.externalIds, upserted.id, 'position');
      imported += 1;

      if (entry.raceEras.length > 0) {
        const raceEras = await this.resolveRaceEras(entry, ctx);
        if (raceEras !== undefined) {
          await this.positionsImport.syncRaceEras(
            { positionId: upserted.id, raceEras },
            ctx.errors,
          );
        }
      }
    }
    return imported;
  }

  /**
   * Resolve every race/era availability pair for a position. Returns undefined
   * (recording one error per unresolved ref) if any pair can't be resolved, so
   * the caller skips the syncRaceEras call.
   */
  private async resolveRaceEras(
    entry: PositionEntry,
    ctx: ProcessContext,
  ): Promise<SyncPositionRaceErasData['raceEras'] | undefined> {
    const label = `Cannot sync race-eras for position "${entry.name}"`;
    const raceEras: SyncPositionRaceErasData['raceEras'] = [];
    let ok = true;
    for (const pair of entry.raceEras) {
      const raceId = await this.refResolver.resolveRef({
        ref: pair.race,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'race',
      });
      const eraId = await this.refResolver.resolveRef({
        ref: pair.era,
        systemIds: ctx.systemIds,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'era',
      });
      if (raceId === undefined || eraId === undefined) {
        ok = false;
      } else {
        raceEras.push({ raceId, eraId });
      }
    }
    return ok ? raceEras : undefined;
  }
}
