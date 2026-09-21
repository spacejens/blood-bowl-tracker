import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetKeywordsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { TpKeywordCatalog } from './tp-keyword-catalog.service';

interface SyncTpPositionKeywordsOptions {
  /** positionId -> rulesSetId -> TP's keyword codes, in TP's own order. */
  keywordCodesByPositionId: Map<number, Map<number, number[]>>;
  catalog: TpKeywordCatalog;
  positionNamesById: Map<number, string>;
}

/**
 * Writes which keywords each position carries under each rules set.
 *
 * Species keywords are BB2025-only in practice: TP's `race` array is empty
 * for every other rules set. Positional keywords (including Big Guy) are
 * not BB2025-exclusive -- DB2021 publishes the full positional set and
 * BB2020 and DB2021 both publish Big Guy -- so DB2021 and BB2020 rows can
 * write real positional-keyword rows too; no special-casing by rules set is
 * needed or wanted either way.
 *
 * An unrecognised code is an ImportError pointing the developer at
 * tools/import-manual, reported once per code rather than once per position
 * that carries it -- the same do-not-repeat-a-known-gap policy the starting
 * skills import follows. The position's other keywords are still recorded:
 * dropping real data over one uncurated code would lose more than it
 * protects.
 *
 * One sync call per (position, rules set): the server rejects a batch
 * all-or-nothing, so a smaller batch keeps one bad entry from costing a
 * position its other rules sets.
 */
@Injectable()
export class TpPositionKeywordsImportService {
  constructor(
    private readonly positionKeywordsImport: PositionRulesSetKeywordsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async syncPositionKeywords({
    keywordCodesByPositionId,
    catalog,
    positionNamesById,
  }: SyncTpPositionKeywordsOptions): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    const reportedCodes = new Set<number>();
    let imported = 0;

    for (const [positionId, codesByRulesSetId] of keywordCodesByPositionId) {
      for (const [rulesSetId, codes] of codesByRulesSetId) {
        const keywordIds = new Set<number>();
        for (const code of codes) {
          const keyword = catalog.byCode.get(code);
          if (keyword === undefined) {
            if (!reportedCodes.has(code)) {
              reportedCodes.add(code);
              errors.push(
                this.importResults.error({
                  item: { position: positionId, keywordCode: code },
                  message:
                    `TP keyword code ${code} (first seen on position ` +
                    `"${positionNamesById.get(positionId) ?? `id ${positionId}`}") ` +
                    'is not curated, so it is left off that position. Curate ' +
                    'it in tools/import-manual ' +
                    '(data/before-other-importers/keywords.json5).',
                }),
              );
            }
            continue;
          }
          // A Set, not an array: TP has been seen to repeat a code within one
          // position's array, and the server rejects a batch that names the
          // same triple twice.
          keywordIds.add(keyword.keywordId);
        }
        if (keywordIds.size === 0) {
          continue;
        }
        const synced =
          await this.positionKeywordsImport.syncPositionRulesSetKeywords(
            {
              entries: [...keywordIds].map((keywordId) => ({
                positionId,
                rulesSetId,
                keywordId,
              })),
            },
            errors,
          );
        if (synced) {
          imported += keywordIds.size;
        }
      }
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
