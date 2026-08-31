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
      const upserted = await this.positionsImport.upsert(
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
   * Resolve every race/era availability pair for a position, together with
   * the rules set naming the formats its characteristics are validated
   * against. Returns undefined (recording one error per unresolved ref) if
   * any reference can't be resolved, so the caller skips the syncRaceEras
   * call.
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
      const rulesSetId = pair.characteristics
        ? await this.refResolver.resolveRef({
            ref: pair.characteristics.rulesSet,
            systemIds: ctx.systemIds,
            errors: ctx.errors,
            item: entry,
            label,
            kind: 'rulesSet',
          })
        : undefined;
      if (
        raceId === undefined ||
        eraId === undefined ||
        (pair.characteristics !== undefined && rulesSetId === undefined)
      ) {
        ok = false;
        continue;
      }
      raceEras.push({
        raceId,
        eraId,
        ...(pair.characteristics && rulesSetId !== undefined
          ? {
              characteristics: {
                rulesSetId,
                move: pair.characteristics.move,
                strength: pair.characteristics.strength,
                agility: pair.characteristics.agility,
                // An omitted Passing means the rules set has none, which the
                // API and the database both spell as an explicit null.
                passing: pair.characteristics.passing ?? null,
                armour: pair.characteristics.armour,
              },
            }
          : {}),
      });
    }
    return ok ? raceEras : undefined;
  }
}
