import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetKeywordsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialBatchSyncService } from './tp-official-batch-sync.service';
import type { TpOfficialKeywordCatalog } from './tp-official-keyword-catalog.service';
import { TpOfficialKeywordsSyncService } from './tp-official-keywords-sync.service';
import {
  officialTeamsContext,
  positionSlot,
  RULES_SET_ID,
} from './tp-official-teams.test-helpers';

const CATALOG: TpOfficialKeywordCatalog = {
  byCode: new Map([
    [4, { keywordId: 100, name: 'Blitzer' }],
    [12, { keywordId: 101, name: 'Orc' }],
  ]),
};

describe('TpOfficialKeywordsSyncService', () => {
  let service: TpOfficialKeywordsSyncService;
  let positionKeywords: MockProxy<PositionRulesSetKeywordsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    positionKeywords = mock<PositionRulesSetKeywordsService>();
    positionKeywords.sync.mockResolvedValue({
      positionRulesSetKeywordIds: [1],
    });
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialKeywordsSyncService,
        TpOfficialBatchSyncService,
        TpImportResultsService,
        TpUpsertRunnerService,
        {
          provide: PositionRulesSetKeywordsService,
          useValue: positionKeywords,
        },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialKeywordsSyncService);
  });

  it("writes each position's curated keywords under the rules set, deduping repeated codes", async () => {
    const imported = await service.syncKeywords({
      slots: [positionSlot({ keywordCodes: [4, 12, 4] })],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(positionKeywords.sync).toHaveBeenCalledWith({
      entries: [
        { positionId: 9, rulesSetId: RULES_SET_ID, keywordId: 100 },
        { positionId: 9, rulesSetId: RULES_SET_ID, keywordId: 101 },
      ],
    });
    expect(imported).toBe(2);
    expect(errors).toEqual([]);
  });

  it("reports an uncurated code once, keeping the position's other keywords", async () => {
    const imported = await service.syncKeywords({
      slots: [
        positionSlot({ keywordCodes: [4, 99] }),
        positionSlot({ positionId: 12, name: 'Thrower', keywordCodes: [99] }),
      ],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(positionKeywords.sync).toHaveBeenCalledTimes(1);
    expect(imported).toBe(1);
    expect(errors).toEqual([
      {
        item: { position: 9, keywordCode: 99 },
        message:
          'TP keyword code 99 (first seen on position "Blitzer") is not curated, so it is left off that position. Curate it in tools/import-manual (data/before-other-importers/keywords.json5).',
      },
    ]);
  });

  it('skips a position with no keywords', async () => {
    await service.syncKeywords({
      slots: [positionSlot()],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(positionKeywords.sync).not.toHaveBeenCalled();
  });

  it("writes every position's keywords in one call", async () => {
    const imported = await service.syncKeywords({
      slots: [
        positionSlot({ keywordCodes: [4] }),
        positionSlot({
          positionId: 12,
          name: 'Thrower',
          keywordCodes: [4, 12],
        }),
      ],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(positionKeywords.sync).toHaveBeenCalledTimes(1);
    expect(positionKeywords.sync).toHaveBeenCalledWith({
      entries: [
        { positionId: 9, rulesSetId: RULES_SET_ID, keywordId: 100 },
        { positionId: 12, rulesSetId: RULES_SET_ID, keywordId: 100 },
        { positionId: 12, rulesSetId: RULES_SET_ID, keywordId: 101 },
      ],
    });
    expect(imported).toBe(3);
    expect(errors).toEqual([]);
  });

  it('falls back to one call per position when the batch is rejected', async () => {
    positionKeywords.sync.mockRejectedValueOnce(new Error('batch rejected'));

    const imported = await service.syncKeywords({
      slots: [
        positionSlot({ keywordCodes: [4] }),
        positionSlot({ positionId: 12, name: 'Thrower', keywordCodes: [12] }),
      ],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(positionKeywords.sync).toHaveBeenCalledTimes(3);
    expect(positionKeywords.sync).toHaveBeenNthCalledWith(2, {
      entries: [{ positionId: 9, rulesSetId: RULES_SET_ID, keywordId: 100 }],
    });
    expect(positionKeywords.sync).toHaveBeenNthCalledWith(3, {
      entries: [{ positionId: 12, rulesSetId: RULES_SET_ID, keywordId: 101 }],
    });
    expect(imported).toBe(2);
    expect(errors).toEqual([]);
  });

  it("records a rejected position's write and still writes the others", async () => {
    positionKeywords.sync
      .mockRejectedValueOnce(new Error('batch rejected'))
      .mockRejectedValueOnce(new Error('no characteristics row'))
      .mockResolvedValueOnce({ positionRulesSetKeywordIds: [2] });

    const imported = await service.syncKeywords({
      slots: [
        positionSlot({ keywordCodes: [4] }),
        positionSlot({ positionId: 12, name: 'Thrower', keywordCodes: [12] }),
      ],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(imported).toBe(1);
    expect(errors).toEqual([
      {
        item: { positionId: 9, rulesSet: 'BB2020' },
        message:
          'Failed to write the keywords of position "Blitzer" (BB2020): no characteristics row',
      },
    ]);
  });
});
