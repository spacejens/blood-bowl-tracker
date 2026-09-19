import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  KeywordsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

/** One curated keyword, addressed by the numeric code TP publishes. */
export interface TpKeywordCatalogEntry {
  keywordId: number;
  name: string;
}

export interface TpKeywordCatalog {
  byCode: Map<number, TpKeywordCatalogEntry>;
}

/**
 * Reads the curated keyword catalogue once per run and keys it by TP's own
 * numeric code.
 *
 * TP publishes keywords only as codes -- as a position's `race` array and as
 * a Hatred or Animosity skill's type-3 attribute value -- and names none of
 * them anywhere. The names live in tools/import-manual
 * (data/before-other-importers/keywords.json5), each with its code as a
 * `tourplay.net` external id; this service turns that into the code -> row
 * map every keyword consumer in this tool needs.
 *
 * A failed read yields an empty catalogue with the error already recorded,
 * rather than throwing: the rest of the import is unaffected by missing
 * keywords, and each consumer reports its own unresolved codes.
 */
@Injectable()
export class TpKeywordCatalogService {
  constructor(
    private readonly keywordsImport: KeywordsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  async load(errors: ImportError[]): Promise<TpKeywordCatalog> {
    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return { byCode: new Map() };
    }
    const [tpSystemId] = bootstrap.ids;

    const rows = await this.keywordsImport.listKeywords(tpSystemId, errors);
    const byCode = new Map<number, TpKeywordCatalogEntry>();
    for (const row of rows ?? []) {
      const code = Number(row.externalId);
      // A curated keyword may also carry non-numeric ids under other systems;
      // only the numeric tourplay.net ones address a TP code.
      if (!Number.isInteger(code)) {
        continue;
      }
      byCode.set(code, { keywordId: row.keywordId, name: row.name });
    }
    return { byCode };
  }
}
