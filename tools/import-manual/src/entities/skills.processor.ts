import { SkillsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Upserts the curated `skills` entries, the same way RulesSetsProcessor
 * upserts rules sets. Only skills no source importer can ever produce need an
 * entry: a skill BBL or TP also knows lands on the same row via the same
 * "Name" external id.
 */
@Injectable()
export class SkillsProcessor {
  constructor(
    private readonly skillsImport: SkillsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.skills) {
      const upserted = await this.skillsImport.upsert(
        {
          name: entry.name,
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
