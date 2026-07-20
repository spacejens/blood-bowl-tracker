import { TeamsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import {
  resolveRef,
  resolveRefs,
  toExternalIds,
} from '../references/resolve-refs';

@Injectable()
export class TeamsProcessor {
  constructor(private readonly teamsImport: TeamsImportService) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.teams) {
      const label = `Cannot import team "${entry.name}"`;
      const raceId = resolveRef({
        ref: entry.race,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
      });
      const coachId = resolveRef({
        ref: entry.coach,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
      });
      const eras = resolveRefs({
        refs: entry.eras,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
      });
      if (raceId === undefined || coachId === undefined || eras === undefined) {
        continue;
      }
      const upserted = await this.teamsImport.upsertTeam(
        {
          name: entry.name,
          raceId,
          coachId,
          eras,
          externalIds: toExternalIds(entry.externalIds, ctx.systemIds),
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
