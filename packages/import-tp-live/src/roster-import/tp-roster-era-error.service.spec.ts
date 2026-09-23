import { ImportResultService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { mockImportResultService } from '../import-package.test-helpers';
import { TpRosterEraErrorService } from './tp-roster-era-error.service';

describe('TpRosterEraErrorService', () => {
  let service: TpRosterEraErrorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterEraErrorService,
        { provide: ImportResultService, useValue: mockImportResultService() },
      ],
    }).compile();
    service = moduleRef.get(TpRosterEraErrorService);
  });

  it('builds an ImportError naming the era and roster id', () => {
    const error = service.unknownEraError('Ghost era', {
      id: 42,
      teamName: 'T',
      teamRaceCode: 'Orc',
      raceName: 'Orc',
      coachTpId: 'coach-1',
      positions: [],
      starPositions: [],
      players: [],
    });

    expect(error).toEqual({
      item: { era: 'Ghost era', roster: 42 },
      message:
        'Unknown era "Ghost era" for roster 42: not found among imported eras.',
    });
  });
});
