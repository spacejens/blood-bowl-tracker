import type { ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';

import {
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { TpCompetitionIdResolverService } from './tp-competition-id-resolver.service';

const TP_SYSTEM_ID = 9;
const CANNED_RESULT: ImportResult = { success: true, imported: 0, errors: [] };

async function makeService(
  lookup: MockProxy<ReferenceLookupService> = mockReferenceLookupService(
    new Map(),
    TP_SYSTEM_ID,
  ),
) {
  const importResults = mockImportResultService();
  importResults.result.mockReturnValue(CANNED_RESULT);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpCompetitionIdResolverService,
      { provide: ReferenceLookupService, useValue: lookup },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpCompetitionIdResolverService),
    lookup,
    importResults,
  };
}

describe('TpCompetitionIdResolverService', () => {
  it('resolves every imported competition to its database id in one batched call', async () => {
    const { service, lookup, importResults } = await makeService(
      mockReferenceLookupService(new Map(), TP_SYSTEM_ID, {
        competitionIdsByExternalId: new Map([['100', 42]]),
      }),
    );

    const outcome = await service.resolveCompetitionIds({
      tpIds: [100],
      tpSystemId: TP_SYSTEM_ID,
    });

    expect(outcome.competitionIdsByTpId).toEqual(new Map([[100, 42]]));
    expect(lookup.lookupMap).toHaveBeenCalledWith('competition', [
      { externalSystemId: TP_SYSTEM_ID, externalId: '100' },
    ]);
    expect(importResults.result).toHaveBeenCalledWith({
      imported: 0,
      errors: [],
    });
    expect(outcome.result).toBe(CANNED_RESULT);
  });

  it('records an error and omits a competition that does not resolve', async () => {
    const { service, importResults } = await makeService();

    const outcome = await service.resolveCompetitionIds({
      tpIds: [100],
      tpSystemId: TP_SYSTEM_ID,
    });

    expect(outcome.competitionIdsByTpId.size).toBe(0);
    expect(importResults.result).toHaveBeenCalledWith({
      imported: 0,
      errors: [
        {
          item: { competition: 100 },
          message:
            'Could not resolve competition id 100 to a database id: its match files and missing trophy awards will be skipped.',
        },
      ],
    });
  });

  it('looks nothing up when the TP system could not be set up', async () => {
    const { service, lookup } = await makeService();

    const outcome = await service.resolveCompetitionIds({
      tpIds: [100],
      tpSystemId: undefined,
    });

    expect(outcome.competitionIdsByTpId.size).toBe(0);
    expect(lookup.lookupMap).not.toHaveBeenCalled();
  });

  it('looks nothing up when no competition was imported', async () => {
    const { service, lookup } = await makeService();

    await service.resolveCompetitionIds({
      tpIds: [],
      tpSystemId: TP_SYSTEM_ID,
    });

    expect(lookup.lookupMap).not.toHaveBeenCalled();
  });
});
