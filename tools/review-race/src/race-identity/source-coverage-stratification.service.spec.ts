import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { SourceCoverageStratificationService } from './source-coverage-stratification.service';

async function makeService(
  dbResult: MockDbResult,
  externalSystems?: MockProxy<ExternalSystemLookupService>,
  manual?: MockProxy<ManualRawDataService>,
): Promise<SourceCoverageStratificationService> {
  const extSys = externalSystems || mock<ExternalSystemLookupService>();
  if (!externalSystems) {
    extSys.getSystemId.mockResolvedValue(1);
  }
  const manualSvc = manual || mock<ManualRawDataService>();
  if (!manual) {
    manualSvc.races.mockResolvedValue([]);
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      SourceCoverageStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: extSys },
      { provide: ManualRawDataService, useValue: manualSvc },
    ],
  }).compile();
  return moduleRef.get(SourceCoverageStratificationService);
}

describe('SourceCoverageStratificationService', () => {
  it('offers no-bbl, no-tp, and no-manual strata', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      { id: 'no-bbl', label: 'Race has no BBL data', sources: ['bbl'] },
      { id: 'no-tp', label: 'Race has no TP data', sources: ['tp'] },
      {
        id: 'no-manual',
        label: 'Race has no manual curation entry',
        sources: ['manual'],
      },
    ]);
  });

  it('queries no-bbl with left-join and is-null filter for the BBL system id', async () => {
    const dbResult = mockDb([
      {
        raceId: 42,
        raceName: 'Dwarves',
      },
    ]);
    const externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(7);
    const service = await makeService(dbResult, externalSystems);

    const races = await service.sampleStratum({
      stratumId: 'no-bbl',
      limit: 3,
      source: 'bbl',
    });

    expect(races).toEqual([
      {
        raceId: 42,
        raceName: 'Dwarves',
      },
    ]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('bbl');
    // Verify the bound param includes the external system id in the leftJoin condition
    const joinCall = dbResult.chains[0].leftJoin.mock.calls[0][1] as SQL;
    const rendered = new PgDialect().sqlToQuery(joinCall);
    expect(rendered.params).toContain(7);
  });

  it('queries no-tp with left-join and is-null filter for the TP system id', async () => {
    const dbResult = mockDb([]);
    const externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(9);
    const service = await makeService(dbResult, externalSystems);

    await service.sampleStratum({
      stratumId: 'no-tp',
      limit: 3,
      source: 'tp',
    });

    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
    // Verify the bound param includes the external system id in the leftJoin condition
    const joinCall = dbResult.chains[0].leftJoin.mock.calls[0][1] as SQL;
    const rendered = new PgDialect().sqlToQuery(joinCall);
    expect(rendered.params).toContain(9);
  });

  it('calls manual.races() to get curated entries', async () => {
    const manualSvc = mock<ManualRawDataService>();
    manualSvc.races.mockResolvedValue([{ name: 'Dwarves' }] as never);
    const dbResult = mockDb([
      { raceId: 1, raceName: 'Elves' },
      { raceId: 2, raceName: 'Orcs' },
    ]);

    const service = await makeService(dbResult, undefined, manualSvc);

    await service.sampleStratum({
      stratumId: 'no-manual',
      limit: 10,
      source: 'manual',
    });

    expect(manualSvc.races).toHaveBeenCalled();
  });

  it('excludes races that have manual curation entries (case-insensitive)', async () => {
    const manualSvc = mock<ManualRawDataService>();
    // Seed with 'Dwarves' (uppercase)
    manualSvc.races.mockResolvedValue([{ name: 'Dwarves' }] as never);
    const dbResult = mockDb([
      // This race matches the manual entry (case-insensitive)
      { raceId: 1, raceName: 'dwarves' },
      // These races do not match
      { raceId: 2, raceName: 'Elves' },
      { raceId: 3, raceName: 'Orcs' },
    ]);

    const service = await makeService(dbResult, undefined, manualSvc);

    const races = await service.sampleStratum({
      stratumId: 'no-manual',
      limit: 2,
      source: 'manual',
    });

    // Verify that the matching race (dwarves) is excluded
    expect(races).not.toContainEqual({ raceId: 1, raceName: 'dwarves' });
    // Verify that non-matching races are included
    expect(races).toContainEqual({ raceId: 2, raceName: 'Elves' });
    expect(races).toContainEqual({ raceId: 3, raceName: 'Orcs' });
    // Verify that the limit is honored
    expect(races).toHaveLength(2);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown race stratum "nope"/);
  });
});
