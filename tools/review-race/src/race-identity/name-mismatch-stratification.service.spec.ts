import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RaceNameComparisonService } from '../shared/race-name-comparison.service';
import { BblRawRaceIndexService } from '../source/bbl-raw-race-index.service';
import { TpRawRosterIndexService } from '../source/tp-raw-roster-index.service';
import { NameMismatchStratificationService } from './name-mismatch-stratification.service';

interface MakeServiceOpts {
  externalIds?: RaceExternalIdsService;
  bblIndex?: BblRawRaceIndexService;
  tpIndex?: TpRawRosterIndexService;
  comparison?: RaceNameComparisonService;
}

async function makeService(
  dbResult: MockDbResult,
  opts: MakeServiceOpts = {},
): Promise<NameMismatchStratificationService> {
  const extIds = opts.externalIds || mock<RaceExternalIdsService>();
  const bbl = opts.bblIndex || mock<BblRawRaceIndexService>();
  const tp = opts.tpIndex || mock<TpRawRosterIndexService>();
  const comp =
    opts.comparison || (await createRealRaceNameComparisonService(dbResult));

  const moduleRef = await Test.createTestingModule({
    providers: [
      NameMismatchStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: RaceExternalIdsService, useValue: extIds },
      { provide: BblRawRaceIndexService, useValue: bbl },
      { provide: TpRawRosterIndexService, useValue: tp },
      { provide: RaceNameComparisonService, useValue: comp },
    ],
  }).compile();
  return moduleRef.get(NameMismatchStratificationService);
}

async function createRealRaceNameComparisonService(
  dbResult: MockDbResult,
): Promise<RaceNameComparisonService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceNameComparisonService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(RaceNameComparisonService);
}

describe('NameMismatchStratificationService', () => {
  it('offers one name-mismatch stratum', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'name-mismatch',
        label: 'BBL and TP names disagree',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('includes a race whose BBL and TP names disagree', async () => {
    const dbResult = mockDb([
      { raceId: 1, raceName: 'Elven Union' },
      { raceId: 2, raceName: 'Dwarves' },
    ]);
    const externalIds = mock<RaceExternalIdsService>();
    const bblIndex = mock<BblRawRaceIndexService>();
    const tpIndex = mock<TpRawRosterIndexService>();

    // Race 1: BBL "Elven Union Team" vs TP "Wood Elf" - mismatch
    externalIds.forRace.mockImplementation((raceId) => {
      if (raceId === 1) {
        return Promise.resolve({ bbl: ['1'], tp: ['w'], name: [] });
      }
      // Race 2: BBL "Dwarf Team" vs TP "Dwarf" - match (Team suffix is ignored)
      return Promise.resolve({ bbl: ['2'], tp: ['d'], name: [] });
    });

    bblIndex.raceFor.mockImplementation((id) => {
      if (id === '1') {
        return Promise.resolve({
          listName: 'Elven Union Team',
          teamPageName: 'Elven Union Team',
        } as never);
      }
      if (id === '2') {
        return Promise.resolve({
          listName: 'Dwarf Team',
          teamPageName: 'Dwarf Team',
        } as never);
      }
      return Promise.resolve(null);
    });

    tpIndex.raceFor.mockImplementation((code) => {
      if (code === 'w') {
        return Promise.resolve({ rosterName: 'Wood Elf' } as never);
      }
      if (code === 'd') {
        return Promise.resolve({ rosterName: 'Dwarf' } as never);
      }
      return Promise.resolve(null);
    });

    const service = await makeService(dbResult, {
      externalIds,
      bblIndex,
      tpIndex,
    });

    const races = await service.sampleStratum({
      stratumId: 'name-mismatch',
      limit: 10,
      source: 'bbl',
    });

    // Only race 1 should be returned (name mismatch)
    expect(races.map((r) => r.raceId)).toContain(1);
  });

  it('excludes a race whose BBL and TP names agree', async () => {
    const dbResult = mockDb([{ raceId: 1, raceName: 'Dwarves' }]);
    const externalIds = mock<RaceExternalIdsService>();
    const bblIndex = mock<BblRawRaceIndexService>();
    const tpIndex = mock<TpRawRosterIndexService>();

    // Both report "Dwarf" - should agree
    externalIds.forRace.mockResolvedValue({
      bbl: ['2'],
      tp: ['d'],
      name: [],
    });

    bblIndex.raceFor.mockResolvedValue({
      listName: 'Dwarf Team',
      teamPageName: 'Dwarf Team',
    } as never);

    tpIndex.raceFor.mockResolvedValue({
      rosterName: 'Dwarf',
    } as never);

    const service = await makeService(dbResult, {
      externalIds,
      bblIndex,
      tpIndex,
    });

    const races = await service.sampleStratum({
      stratumId: 'name-mismatch',
      limit: 10,
      source: 'bbl',
    });

    expect(races).toHaveLength(0);
  });

  it('excludes a race missing BBL name', async () => {
    const dbResult = mockDb([{ raceId: 1, raceName: 'Unknown' }]);
    const externalIds = mock<RaceExternalIdsService>();
    const bblIndex = mock<BblRawRaceIndexService>();
    const tpIndex = mock<TpRawRosterIndexService>();

    externalIds.forRace.mockResolvedValue({
      bbl: ['999'],
      tp: ['w'],
      name: [],
    });

    // BBL has no data
    bblIndex.raceFor.mockResolvedValue(null);
    tpIndex.raceFor.mockResolvedValue({
      rosterName: 'Wood Elf',
    } as never);

    const service = await makeService(dbResult, {
      externalIds,
      bblIndex,
      tpIndex,
    });

    const races = await service.sampleStratum({
      stratumId: 'name-mismatch',
      limit: 10,
      source: 'bbl',
    });

    expect(races).toHaveLength(0);
  });

  it('excludes a race missing TP name', async () => {
    const dbResult = mockDb([{ raceId: 1, raceName: 'Unknown' }]);
    const externalIds = mock<RaceExternalIdsService>();
    const bblIndex = mock<BblRawRaceIndexService>();
    const tpIndex = mock<TpRawRosterIndexService>();

    externalIds.forRace.mockResolvedValue({
      bbl: ['1'],
      tp: ['999'],
      name: [],
    });

    bblIndex.raceFor.mockResolvedValue({
      listName: 'Elven Union Team',
    } as never);
    // TP has no data
    tpIndex.raceFor.mockResolvedValue(null);

    const service = await makeService(dbResult, {
      externalIds,
      bblIndex,
      tpIndex,
    });

    const races = await service.sampleStratum({
      stratumId: 'name-mismatch',
      limit: 10,
      source: 'bbl',
    });

    expect(races).toHaveLength(0);
  });

  it('honors the limit', async () => {
    const dbResult = mockDb([
      { raceId: 1, raceName: 'Race1' },
      { raceId: 2, raceName: 'Race2' },
      { raceId: 3, raceName: 'Race3' },
    ]);
    const externalIds = mock<RaceExternalIdsService>();
    const bblIndex = mock<BblRawRaceIndexService>();
    const tpIndex = mock<TpRawRosterIndexService>();

    // All races have mismatched names
    externalIds.forRace.mockImplementation((raceId) =>
      Promise.resolve({
        bbl: [String(raceId)],
        tp: [String(raceId)],
        name: [],
      }),
    );

    bblIndex.raceFor.mockImplementation((id) =>
      Promise.resolve({
        listName: `BBL Race ${id}`,
      } as never),
    );

    tpIndex.raceFor.mockImplementation((id) =>
      Promise.resolve({
        rosterName: `TP Race ${id}`,
      } as never),
    );

    const service = await makeService(dbResult, {
      externalIds,
      bblIndex,
      tpIndex,
    });

    const races = await service.sampleStratum({
      stratumId: 'name-mismatch',
      limit: 2,
      source: 'bbl',
    });

    expect(races).toHaveLength(2);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown race stratum "nope"/);
  });
});
