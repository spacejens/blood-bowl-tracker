import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { SourceCoverageStratificationService } from './source-coverage-stratification.service';

interface MakeServiceOptions {
  externalSystems?: MockProxy<ExternalSystemLookupService>;
  manual?: MockProxy<ManualRawDataService>;
  starIds?: MockProxy<StarPlayerExternalIdsService>;
}

async function makeService(
  dbResult: MockDbResult,
  options: MakeServiceOptions = {},
): Promise<SourceCoverageStratificationService> {
  const { externalSystems, manual, starIds } = options;
  const extSys = externalSystems || mock<ExternalSystemLookupService>();
  if (!externalSystems) {
    extSys.getSystemId.mockResolvedValue(1);
  }
  const manualSvc = manual || mock<ManualRawDataService>();
  if (!manual) {
    manualSvc.starPlayers.mockResolvedValue([]);
  }
  const starIdsSvc = starIds || mock<StarPlayerExternalIdsService>();
  if (!starIds) {
    starIdsSvc.allForPosition.mockResolvedValue([]);
  }

  const moduleRef = await Test.createTestingModule({
    providers: [
      SourceCoverageStratificationService,
      { provide: DB, useValue: dbResult.db },
      { provide: ExternalSystemLookupService, useValue: extSys },
      { provide: ManualRawDataService, useValue: manualSvc },
      { provide: StarPlayerExternalIdsService, useValue: starIdsSvc },
      StarPlayerNameMatcherService,
    ],
  }).compile();
  return moduleRef.get(SourceCoverageStratificationService);
}

describe('SourceCoverageStratificationService', () => {
  it('offers no-bbl, no-tp, and no-manual strata', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      { id: 'no-bbl', label: 'Star player has no BBL data', sources: ['bbl'] },
      { id: 'no-tp', label: 'Star player has no TP data', sources: ['tp'] },
      {
        id: 'no-manual',
        label: 'Star player has no manual curation entry',
        sources: ['manual'],
      },
    ]);
  });

  it('queries no-bbl with left-join and is-null filter for the BBL system id', async () => {
    const dbResult = mockDb([
      {
        positionId: 42,
        positionName: 'Griff Oberwald',
      },
    ]);
    const externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(7);
    const service = await makeService(dbResult, { externalSystems });

    const stars = await service.sampleStratum({
      stratumId: 'no-bbl',
      limit: 3,
      source: 'bbl',
    });

    expect(stars).toEqual([
      {
        positionId: 42,
        positionName: 'Griff Oberwald',
      },
    ]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('bbl');
    const whereCondition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(whereCondition);
    expect(rendered.sql).toContain('is_star_player');

    const joinCall = dbResult.chains[0].leftJoin.mock.calls[0][1] as SQL;
    const joinRendered = new PgDialect().sqlToQuery(joinCall);
    expect(joinRendered.params).toContain(7);
  });

  it('queries no-tp with left-join and is-null filter for the TP system id', async () => {
    const dbResult = mockDb([]);
    const externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(9);
    const service = await makeService(dbResult, { externalSystems });

    await service.sampleStratum({
      stratumId: 'no-tp',
      limit: 3,
      source: 'tp',
    });

    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
    const joinCall = dbResult.chains[0].leftJoin.mock.calls[0][1] as SQL;
    const rendered = new PgDialect().sqlToQuery(joinCall);
    expect(rendered.params).toContain(9);
  });

  it('calls manual.starPlayers() to get curated entries', async () => {
    const manualSvc = mock<ManualRawDataService>();
    manualSvc.starPlayers.mockResolvedValue([
      { name: 'Griff Oberwald', externalIds: [] },
    ]);
    const dbResult = mockDb([
      { positionId: 1, positionName: 'Morg N Thorg' },
      { positionId: 2, positionName: 'Deeproot Strongbranch' },
    ]);

    const service = await makeService(dbResult, { manual: manualSvc });

    await service.sampleStratum({
      stratumId: 'no-manual',
      limit: 10,
      source: 'manual',
    });

    expect(manualSvc.starPlayers).toHaveBeenCalled();
  });

  it('excludes star players that have a matching manual curation entry, by exact name', async () => {
    const manualSvc = mock<ManualRawDataService>();
    manualSvc.starPlayers.mockResolvedValue([
      { name: 'Griff Oberwald', externalIds: [] },
    ]);
    const dbResult = mockDb([
      // This star matches the manual entry by exact name.
      { positionId: 1, positionName: 'Griff Oberwald' },
      // These stars do not match.
      { positionId: 2, positionName: 'Morg N Thorg' },
      { positionId: 3, positionName: 'Deeproot Strongbranch' },
    ]);

    const service = await makeService(dbResult, { manual: manualSvc });

    const stars = await service.sampleStratum({
      stratumId: 'no-manual',
      limit: 2,
      source: 'manual',
    });

    expect(stars).not.toContainEqual({
      positionId: 1,
      positionName: 'Griff Oberwald',
    });
    expect(stars).toContainEqual({
      positionId: 2,
      positionName: 'Morg N Thorg',
    });
    expect(stars).toContainEqual({
      positionId: 3,
      positionName: 'Deeproot Strongbranch',
    });
    expect(stars).toHaveLength(2);
  });

  it('excludes a star matched only by external id, even when the curated name differs', async () => {
    const manualSvc = mock<ManualRawDataService>();
    manualSvc.starPlayers.mockResolvedValue([
      { name: 'Griff', externalIds: [{ system: 'BBL', id: '5-1' }] },
    ]);
    const dbResult = mockDb([
      { positionId: 1, positionName: 'Griff Oberwald' },
      { positionId: 2, positionName: 'Morg N Thorg' },
    ]);
    const starIds = mock<StarPlayerExternalIdsService>();
    starIds.allForPosition.mockImplementation((positionId: number) =>
      Promise.resolve(
        positionId === 1 ? [{ systemName: 'BBL', externalId: '5-1' }] : [],
      ),
    );

    const service = await makeService(dbResult, { manual: manualSvc, starIds });

    const stars = await service.sampleStratum({
      stratumId: 'no-manual',
      limit: 10,
      source: 'manual',
    });

    expect(stars).not.toContainEqual({
      positionId: 1,
      positionName: 'Griff Oberwald',
    });
    expect(stars).toContainEqual({
      positionId: 2,
      positionName: 'Morg N Thorg',
    });
  });

  it('stops scanning once the limit is reached, without checking later candidates', async () => {
    const manualSvc = mock<ManualRawDataService>();
    manualSvc.starPlayers.mockResolvedValue([]);
    const dbResult = mockDb([
      { positionId: 1, positionName: 'Griff Oberwald' },
      { positionId: 2, positionName: 'Morg N Thorg' },
      { positionId: 3, positionName: 'Deeproot Strongbranch' },
      { positionId: 4, positionName: 'Grashnak Blackhoof' },
    ]);
    const starIds = mock<StarPlayerExternalIdsService>();
    starIds.allForPosition.mockResolvedValue([]);

    const service = await makeService(dbResult, { manual: manualSvc, starIds });

    const stars = await service.sampleStratum({
      stratumId: 'no-manual',
      limit: 2,
      source: 'manual',
    });

    expect(stars).toHaveLength(2);
    // Only the first two candidates should have been checked against the
    // star's own external ids before the loop stopped.
    expect(starIds.allForPosition).toHaveBeenCalledTimes(2);
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown star player stratum/);
  });
});
