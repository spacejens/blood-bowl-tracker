import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { KeywordCatalogRow } from '@blood-bowl-tracker/game-data';
import { KeywordsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialKeywordCatalogService } from './tp-official-keyword-catalog.service';
import { TP_SYSTEM_ID } from './tp-official-teams.test-helpers';

function row(externalId: string, keywordId: number, name: string) {
  return mock<KeywordCatalogRow>({ externalId, keywordId, name });
}

describe('TpOfficialKeywordCatalogService', () => {
  let service: TpOfficialKeywordCatalogService;
  let keywords: MockProxy<KeywordsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    keywords = mock<KeywordsService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialKeywordCatalogService,
        TpUpsertRunnerService,
        { provide: KeywordsService, useValue: keywords },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialKeywordCatalogService);
  });

  it('keys the curated catalogue by TP numeric code, ignoring non-numeric ids', async () => {
    keywords.listByExternalSystem.mockResolvedValue([
      row('4', 100, 'Blitzer'),
      row('111', 101, 'Elf'),
      row('big-guy', 102, 'Big Guy'),
    ]);

    const catalog = await service.load({ tpSystemId: TP_SYSTEM_ID, errors });

    expect(keywords.listByExternalSystem).toHaveBeenCalledWith(TP_SYSTEM_ID);
    expect(catalog.byCode).toEqual(
      new Map([
        [4, { keywordId: 100, name: 'Blitzer' }],
        [111, { keywordId: 101, name: 'Elf' }],
      ]),
    );
    expect(errors).toEqual([]);
  });

  it('records one error and yields an empty catalogue when the read fails', async () => {
    keywords.listByExternalSystem.mockRejectedValue(new Error('boom'));

    const catalog = await service.load({ tpSystemId: TP_SYSTEM_ID, errors });

    expect(catalog.byCode.size).toBe(0);
    expect(errors).toEqual([
      {
        item: { keywordCatalog: TP_SYSTEM_ID },
        message: 'Failed to read the keyword catalogue: boom',
      },
    ]);
  });
});
