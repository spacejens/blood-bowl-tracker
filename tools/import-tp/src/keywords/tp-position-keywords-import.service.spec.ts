import {
  ImportResultService,
  PositionRulesSetKeywordsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpPositionKeywordsImportService } from './tp-position-keywords-import.service';

describe('TpPositionKeywordsImportService', () => {
  let service: TpPositionKeywordsImportService;
  let keywordsSync: MockProxy<PositionRulesSetKeywordsImportService>;
  let importResults: MockProxy<ImportResultService>;

  const catalog = {
    byCode: new Map([
      [111, { keywordId: 7, name: 'Goblin' }],
      [110, { keywordId: 9, name: 'Undead' }],
    ]),
  };

  beforeEach(async () => {
    keywordsSync = mock<PositionRulesSetKeywordsImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockImplementation((args) => args as never);
    importResults.error.mockImplementation((args) => args);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPositionKeywordsImportService,
        {
          provide: PositionRulesSetKeywordsImportService,
          useValue: keywordsSync,
        },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(TpPositionKeywordsImportService);
  });

  it('syncs every resolved keyword, one call per position and rules set', async () => {
    keywordsSync.syncPositionRulesSetKeywords.mockResolvedValue({
      positionRulesSetKeywordIds: [1, 2],
    });
    await service.syncPositionKeywords({
      keywordCodesByPositionId: new Map([[4, new Map([[2, [111, 110]]])]]),
      catalog,
      positionNamesById: new Map([[4, 'Goblin Lineman']]),
    });
    expect(keywordsSync.syncPositionRulesSetKeywords).toHaveBeenCalledWith(
      {
        entries: [
          { positionId: 4, rulesSetId: 2, keywordId: 7 },
          { positionId: 4, rulesSetId: 2, keywordId: 9 },
        ],
      },
      expect.anything(),
    );
  });

  it('reports an unresolved code once and keeps the rest of the position', async () => {
    keywordsSync.syncPositionRulesSetKeywords.mockResolvedValue({
      positionRulesSetKeywordIds: [1],
    });
    const { result } = await service.syncPositionKeywords({
      keywordCodesByPositionId: new Map([
        [4, new Map([[2, [111, 777]]])],
        [5, new Map([[2, [777]]])],
      ]),
      catalog,
      positionNamesById: new Map([
        [4, 'Goblin Lineman'],
        [5, 'Goblin Bruiser'],
      ]),
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('777');
    expect(result.errors[0].message).toContain('tools/import-manual');
    expect(keywordsSync.syncPositionRulesSetKeywords).toHaveBeenCalledWith(
      { entries: [{ positionId: 4, rulesSetId: 2, keywordId: 7 }] },
      expect.anything(),
    );
  });

  it('drops a duplicated code rather than letting the batch be rejected', async () => {
    keywordsSync.syncPositionRulesSetKeywords.mockResolvedValue({
      positionRulesSetKeywordIds: [1],
    });
    await service.syncPositionKeywords({
      keywordCodesByPositionId: new Map([[4, new Map([[2, [111, 111]]])]]),
      catalog,
      positionNamesById: new Map([[4, 'Goblin Lineman']]),
    });
    expect(keywordsSync.syncPositionRulesSetKeywords).toHaveBeenCalledWith(
      { entries: [{ positionId: 4, rulesSetId: 2, keywordId: 7 }] },
      expect.anything(),
    );
  });

  it('writes nothing when no position carries a keyword', async () => {
    await service.syncPositionKeywords({
      keywordCodesByPositionId: new Map(),
      catalog,
      positionNamesById: new Map(),
    });
    expect(keywordsSync.syncPositionRulesSetKeywords).not.toHaveBeenCalled();
  });
});
