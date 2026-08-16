import { TeamsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

@Injectable()
export class TeamsProcessor {
  constructor(
    private readonly teamsImport: TeamsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.teams) {
      const label = `Cannot import team "${entry.name}"`;
      // All three are resolved before any is checked, so a single entry with
      // several bad references still records one error each -- the behaviour
      // the previous code had.
      const race = this.refResolver.resolveOptionalRef({
        ref: entry.race,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'race',
      });
      const coach = this.refResolver.resolveOptionalRef({
        ref: entry.coach,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'coach',
      });
      // eras defaults to [] and the API's era sync is additive, so an omitted
      // list resolves to [] and leaves the team's existing eras alone.
      const eras = this.refResolver.resolveRefs({
        refs: entry.eras,
        idMap: ctx.idMap,
        errors: ctx.errors,
        item: entry,
        label,
        kind: 'era',
      });
      if (!race.ok || !coach.ok || eras === undefined) {
        continue;
      }
      const upserted = await this.teamsImport.upsertTeam(
        {
          name: entry.name,
          raceId: race.id,
          coachId: coach.id,
          eras,
          externalIds: this.refResolver.toExternalIds(
            entry.externalIds,
            ctx.systemIds,
          ),
        },
        ctx.errors,
      );
      if (upserted) {
        ctx.idMap.add(entry.externalIds, upserted.id, 'team');
        imported += 1;
      }
    }
    return imported;
  }
}
