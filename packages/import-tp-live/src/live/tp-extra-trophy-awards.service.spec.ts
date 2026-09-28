import { MissingTrophyAwardsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpExtraTrophyAwardsService } from './tp-extra-trophy-awards.service';

describe('TpExtraTrophyAwardsService', () => {
  let service: TpExtraTrophyAwardsService;
  let missingTrophyAwards: MockProxy<MissingTrophyAwardsService>;

  beforeEach(async () => {
    missingTrophyAwards = mock<MissingTrophyAwardsService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpExtraTrophyAwardsService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: MissingTrophyAwardsService, useValue: missingTrophyAwards },
      ],
    }).compile();
    service = moduleRef.get(TpExtraTrophyAwardsService);
  });

  it('computes the missing awards of the competition and counts those created', async () => {
    missingTrophyAwards.computeMissingAwards.mockResolvedValue({
      competitionId: 12,
      createdAwardCount: 3,
      awardedTrophyIds: [4, 5],
    });

    await expect(
      service.computeExtras({ competitionId: 12, tournamentSlug: 's30' }),
    ).resolves.toEqual({ success: true, imported: 3, errors: [] });
    expect(missingTrophyAwards.computeMissingAwards).toHaveBeenCalledWith(12);
  });

  it('reports a failure as one error instead of throwing', async () => {
    missingTrophyAwards.computeMissingAwards.mockRejectedValue(
      new Error('database down'),
    );

    await expect(
      service.computeExtras({ competitionId: 12, tournamentSlug: 's30' }),
    ).resolves.toEqual({
      success: false,
      imported: 0,
      errors: [
        {
          item: { tournamentSlug: 's30', competitionId: 12 },
          message:
            'Could not compute the extra trophy awards of competition s30: database down',
        },
      ],
    });
  });
});
