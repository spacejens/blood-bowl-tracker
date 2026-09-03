import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { RaceLookupService } from './race-lookup.service';

async function makeService(dbResult: MockDbResult): Promise<{
  service: RaceLookupService;
  externalSystems: ReturnType<typeof mock<ExternalSystemLookupService>>;
}> {
  const externalSystems = mock<ExternalSystemLookupService>();
  externalSystems.getSystemId.mockResolvedValue(3);
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceLookupService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: externalSystems },
    ],
  }).compile();
  return {
    service: moduleRef.get(RaceLookupService),
    externalSystems,
  };
}

describe('RaceLookupService', () => {
  it('issues no query for an empty id list', async () => {
    const dbResult = mockDb();
    const { service } = await makeService(dbResult);

    expect(await service.findByExternalIds('bbl', [])).toEqual([]);
    expect(dbResult.chains).toHaveLength(0);
  });

  it('resolves a BBL lookup through the external system id', async () => {
    const dbResult = mockDb([{ raceId: 7, raceName: 'Dwarf' }]);
    const { service, externalSystems } = await makeService(dbResult);

    expect(await service.findByExternalIds('bbl', ['5'])).toEqual([
      { raceId: 7, raceName: 'Dwarf' },
    ]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('bbl');
  });

  it('resolves a TP lookup through the external system id', async () => {
    const dbResult = mockDb([{ raceId: 8, raceName: 'Human' }]);
    const { service, externalSystems } = await makeService(dbResult);

    expect(await service.findByExternalIds('tp', ['Human'])).toEqual([
      { raceId: 8, raceName: 'Human' },
    ]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
  });

  it('resolves a manual lookup by race name without touching external systems', async () => {
    const dbResult = mockDb([{ raceId: 9, raceName: 'Orc' }]);
    const { service, externalSystems } = await makeService(dbResult);

    expect(await service.findByExternalIds('manual', ['orc'])).toEqual([
      { raceId: 9, raceName: 'Orc' },
    ]);
    expect(externalSystems.getSystemId).not.toHaveBeenCalled();
  });
});
