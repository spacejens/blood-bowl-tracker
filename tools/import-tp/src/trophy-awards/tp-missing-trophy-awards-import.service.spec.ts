import {
  ImportResultService,
  MissingTrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpMissingTrophyAwardsImportService } from './tp-missing-trophy-awards-import.service';

const CANNED_RESULT = { success: true, imported: 0, errors: [] };

describe('TpMissingTrophyAwardsImportService', () => {
  let service: TpMissingTrophyAwardsImportService;
  let missing: MockProxy<MissingTrophyAwardsImportService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    missing = mock<MissingTrophyAwardsImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockReturnValue(CANNED_RESULT);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMissingTrophyAwardsImportService,
        { provide: MissingTrophyAwardsImportService, useValue: missing },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(TpMissingTrophyAwardsImportService);
  });

  it('asks the server once per competition', async () => {
    missing.computeMissing.mockResolvedValue({
      competitionId: 0,
      createdAwardCount: 0,
      awardedTrophyIds: [],
    });

    await service.importMissingTrophyAwards([11, 12]);

    expect(missing.computeMissing).toHaveBeenCalledTimes(2);
    expect(missing.computeMissing).toHaveBeenNthCalledWith(
      1,
      { competitionId: 11 },
      expect.any(Array),
    );
    expect(missing.computeMissing).toHaveBeenNthCalledWith(
      2,
      { competitionId: 12 },
      expect.any(Array),
    );
  });

  it('reports the awards it created as imported rows', async () => {
    missing.computeMissing.mockResolvedValue({
      competitionId: 11,
      createdAwardCount: 3,
      awardedTrophyIds: [1, 2],
    });

    await service.importMissingTrophyAwards([11]);

    expect(importResults.result.mock.calls[0][0]).toMatchObject({
      imported: 3,
    });
  });

  it('keeps going when one competition fails', async () => {
    missing.computeMissing
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        competitionId: 12,
        createdAwardCount: 1,
        awardedTrophyIds: [1],
      });

    await service.importMissingTrophyAwards([11, 12]);

    expect(importResults.result.mock.calls[0][0]).toMatchObject({
      imported: 1,
    });
  });

  it('reports zero imported and makes no calls for an empty competition list', async () => {
    await service.importMissingTrophyAwards([]);

    expect(missing.computeMissing).not.toHaveBeenCalled();
    expect(importResults.result.mock.calls[0][0]).toMatchObject({
      imported: 0,
      errors: [],
    });
  });
});
