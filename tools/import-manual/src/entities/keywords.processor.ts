import { KeywordsImportService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';

/**
 * Upserts the curated BB2025 keyword catalogue. Nothing references a keyword
 * by reference in the curated data, so there is no resolution step here --
 * only the tourplay.net external id each entry carries, which is what lets
 * tools/import-tp turn a numeric code into this row.
 */
@Injectable()
export class KeywordsProcessor {
  constructor(
    private readonly keywordsImport: KeywordsImportService,
    private readonly refResolver: ReferenceResolverService,
  ) {}

  async process(ctx: ProcessContext): Promise<number> {
    let imported = 0;
    for (const entry of ctx.data.keywords) {
      const upserted = await this.keywordsImport.upsert(
        {
          name: entry.name,
          kind: entry.kind,
          externalIds: this.refResolver.toExternalIds(
            entry.externalIds,
            ctx.systemIds,
          ),
        },
        ctx.errors,
      );
      if (upserted) imported += 1;
    }
    return imported;
  }
}
