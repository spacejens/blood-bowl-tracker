import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  MissingTrophyAwardsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblMissingTrophyAwardsImportService } from './bbl-missing-trophy-awards-import.service';

const CANNED_RESULT = { success: true, imported: 0, errors: [] };
const EXTERNAL_SYSTEM_ID = 5;

// Arbitrary canned keys standing in for whatever `ReferenceLookupService`
// really derives — the mock never reimplements that algorithm, it just
// echoes a fixed key for each bblId the tests use.
const KEY_101 = 'canned-key-101';
const KEY_102 = 'canned-key-102';

// `BblCompetitionEntry`'s underlying `UpsertCompetition` carries no resolved
// database id of its own, so every test resolves ids through the mocked
// `ReferenceLookupService`, mirroring how the service itself does.
function competition(bblId: string): UpsertCompetition {
  return {
    externalIds: [{ externalSystemId: EXTERNAL_SYSTEM_ID, externalId: bblId }],
  } as UpsertCompetition;
}

function competitionsByBblId(
  ...bblIds: string[]
): Map<string, UpsertCompetition> {
  return new Map(bblIds.map((bblId) => [bblId, competition(bblId)]));
}

describe('BblMissingTrophyAwardsImportService', () => {
  let service: BblMissingTrophyAwardsImportService;
  let missing: MockProxy<MissingTrophyAwardsImportService>;
  let importResults: MockProxy<ImportResultService>;
  let lookup: MockProxy<ReferenceLookupService>;

  beforeEach(async () => {
    missing = mock<MissingTrophyAwardsImportService>();
    importResults = mock<ImportResultService>();
    importResults.result.mockReturnValue(CANNED_RESULT);
    lookup = mock<ReferenceLookupService>();
    lookup.keyOf.mockImplementation((ref) => {
      if (ref.externalId === '101') return KEY_101;
      if (ref.externalId === '102') return KEY_102;
      throw new Error(`unexpected reference in test: ${ref.externalId}`);
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblMissingTrophyAwardsImportService,
        { provide: MissingTrophyAwardsImportService, useValue: missing },
        { provide: ImportResultService, useValue: importResults },
        { provide: ReferenceLookupService, useValue: lookup },
      ],
    }).compile();
    service = moduleRef.get(BblMissingTrophyAwardsImportService);
  });

  it('asks the server once per competition', async () => {
    lookup.lookupMap.mockResolvedValue(
      new Map([
        [KEY_101, 11],
        [KEY_102, 12],
      ]),
    );
    missing.computeMissing.mockResolvedValue({
      competitionId: 0,
      createdAwardCount: 0,
      awardedTrophyIds: [],
    });

    await service.importMissingTrophyAwards(competitionsByBblId('101', '102'));

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
    lookup.lookupMap.mockResolvedValue(new Map([[KEY_101, 11]]));
    missing.computeMissing.mockResolvedValue({
      competitionId: 11,
      createdAwardCount: 3,
      awardedTrophyIds: [1, 2],
    });

    await service.importMissingTrophyAwards(competitionsByBblId('101'));

    expect(importResults.result.mock.calls[0][0]).toMatchObject({
      imported: 3,
    });
  });

  it('keeps going when one competition fails', async () => {
    lookup.lookupMap.mockResolvedValue(
      new Map([
        [KEY_101, 11],
        [KEY_102, 12],
      ]),
    );
    missing.computeMissing
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        competitionId: 12,
        createdAwardCount: 1,
        awardedTrophyIds: [1],
      });

    await service.importMissingTrophyAwards(competitionsByBblId('101', '102'));

    expect(importResults.result.mock.calls[0][0]).toMatchObject({
      imported: 1,
    });
  });

  it('skips and records an error for a competition that failed to resolve', async () => {
    lookup.lookupMap.mockResolvedValue(new Map());

    await service.importMissingTrophyAwards(competitionsByBblId('101'));

    expect(missing.computeMissing).not.toHaveBeenCalled();
    expect(importResults.error).toHaveBeenCalledWith(
      expect.objectContaining({
        item: { competition: '101' },
      }),
    );
  });
});
