import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { TpCompetitionIdResolverService } from './tp-competition-id-resolver.service';

const TP_SYSTEM_ID = 9;

function competitionEntry(overrides: Partial<UpsertCompetition> = {}): {
  upsert: UpsertCompetition;
  era: string;
  competition: string;
  competitionGroupId: number;
  created: boolean;
} {
  return {
    upsert: {
      name: 'Winter Cup',
      type: 'cup',
      eraId: 5,
      startDate: '2020-01-01',
      endDate: '2020-01-03',
      teamEraIds: [],
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: '100' }],
      ...overrides,
    },
    era: 'era-1',
    competition: 'winter-cup',
    competitionGroupId: 1,
    created: false,
  };
}

describe('TpCompetitionIdResolverService', () => {
  it('resolves competition ids and derives type/era maps for every hit', async () => {
    const lookup = mockReferenceLookupService(new Map(), TP_SYSTEM_ID, {
      competitionIdsByExternalId: new Map([['100', 42]]),
    });
    const importResults = mockImportResultService();
    importResults.result.mockImplementation((args) => ({
      success: args.errors.length === 0,
      imported: args.imported,
      errors: args.errors,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionIdResolverService,
        { provide: ReferenceLookupService, useValue: lookup },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    const service = moduleRef.get(TpCompetitionIdResolverService);

    const outcome = await service.resolveCompetitionIds({
      competitionsByTpId: new Map([[100, competitionEntry()]]),
    });

    expect(outcome.competitionIdsByTpId.get(100)).toBe(42);
    expect(outcome.competitionTypesByCompetitionId.get(42)).toBe('cup');
    expect(outcome.eraIdByCompetitionId.get(42)).toBe(5);
    expect(outcome.result).toEqual({ success: true, imported: 0, errors: [] });
  });

  it('records an ImportError and omits the competition when it fails to resolve', async () => {
    const lookup = mockReferenceLookupService(new Map(), TP_SYSTEM_ID, {
      competitionIdsByExternalId: new Map(),
    });
    const importResults = mockImportResultService();
    importResults.result.mockImplementation((args) => ({
      success: args.errors.length === 0,
      imported: args.imported,
      errors: args.errors,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionIdResolverService,
        { provide: ReferenceLookupService, useValue: lookup },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    const service = moduleRef.get(TpCompetitionIdResolverService);

    const outcome = await service.resolveCompetitionIds({
      competitionsByTpId: new Map([[100, competitionEntry()]]),
    });

    expect(outcome.competitionIdsByTpId.size).toBe(0);
    expect(outcome.competitionTypesByCompetitionId.size).toBe(0);
    expect(outcome.eraIdByCompetitionId.size).toBe(0);
    expect(outcome.result.success).toBe(false);
    expect(outcome.result.errors).toHaveLength(1);
    expect(outcome.result.errors[0]?.message).toContain('100');
  });
});
