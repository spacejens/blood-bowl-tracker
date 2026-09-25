import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetKeywordsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpOfficialKeywordCatalog } from './tp-official-keyword-catalog.service';
import type { TpOfficialPositionSlot } from './tp-official-positions-upsert.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/** Options for {@link TpOfficialKeywordsSyncService.syncKeywords}. */
export interface SyncOfficialKeywordsOptions {
  slots: TpOfficialPositionSlot[];
  catalog: TpOfficialKeywordCatalog;
  context: TpOfficialTeamsContext;
  errors: ImportError[];
}

@Injectable()
export class TpOfficialKeywordsSyncService {
  constructor(
    private readonly positionKeywords: PositionRulesSetKeywordsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Writes which curated keywords each position carries under the rules
   * set. An uncurated code is reported once per code, not once per position
   * carrying it, and the position's other keywords are still written. One
   * sync call per position: the server rejects a batch all-or-nothing (and
   * rejects a keyword for a position with no characteristics row, which the
   * characteristics step creates first). Returns the keyword rows written.
   */
  async syncKeywords({
    slots,
    catalog,
    context,
    errors,
  }: SyncOfficialKeywordsOptions): Promise<number> {
    const reportedCodes = new Set<number>();
    let imported = 0;
    for (const slot of slots) {
      // A Set: TP has been seen to repeat a code within one position, and the
      // server rejects a batch naming the same triple twice.
      const keywordIds = new Set<number>();
      for (const code of slot.keywordCodes) {
        const keyword = catalog.byCode.get(code);
        if (keyword !== undefined) {
          keywordIds.add(keyword.keywordId);
          continue;
        }
        if (!reportedCodes.has(code)) {
          reportedCodes.add(code);
          errors.push(
            this.importResults.error({
              item: { position: slot.positionId, keywordCode: code },
              message:
                `TP keyword code ${code} (first seen on position "${slot.name}") ` +
                'is not curated, so it is left off that position. Curate it in ' +
                'tools/import-manual (data/before-other-importers/keywords.json5).',
            }),
          );
        }
      }
      if (keywordIds.size === 0) {
        continue;
      }
      const synced = await this.runner.record({
        run: () =>
          this.positionKeywords.sync({
            entries: [...keywordIds].map((keywordId) => ({
              positionId: slot.positionId,
              rulesSetId: context.rulesSetId,
              keywordId,
            })),
          }),
        item: { positionId: slot.positionId, rulesSet: context.rulesSet },
        errors,
        buildErrorMessage: (error) =>
          `Failed to write the keywords of position "${slot.name}" (${context.rulesSet}): ${this.runner.messageOf(error)}`,
      });
      if (synced !== undefined) {
        imported += keywordIds.size;
      }
    }
    return imported;
  }
}
