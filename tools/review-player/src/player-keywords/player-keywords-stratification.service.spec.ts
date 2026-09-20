import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { PlayerKeywordsStratificationService } from './player-keywords-stratification.service';

const row = {
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
};

describe('PlayerKeywordsStratificationService', () => {
  let service: PlayerKeywordsStratificationService;
  let externalSystems: MockProxy<ExternalSystemLookupService>;
  let dbResult: MockDbResult;

  beforeEach(async () => {
    dbResult = mockDb([row]);
    externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(9);
    const query = mock<PlayerProjectionQueryService>();
    query.base.mockReturnValue(
      dbResult.db.select() as unknown as ReturnType<
        PlayerProjectionQueryService['base']
      >,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerKeywordsStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
        { provide: DB, useValue: dbResult.db },
      ],
    }).compile();
    service = moduleRef.get(PlayerKeywordsStratificationService);
  });

  it('offers the BB2025-no-keywords stratum verbatim', () => {
    expect(service.listStrata()).toEqual([
      {
        id: 'bb2025-player-position-without-keywords',
        label: 'Player whose position has no keyword recorded under BB2025',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('tags each sampled player with the source it was drawn for', async () => {
    const players = await service.sampleStratum({
      stratumId: 'bb2025-player-position-without-keywords',
      limit: 3,
      source: 'tp',
    });

    expect(players).toEqual([{ source: 'tp', ...row }]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
  });

  it('joins through position_rules_sets and requires a BB2025 rules set with no keywords', async () => {
    await service.sampleStratum({
      stratumId: 'bb2025-player-position-without-keywords',
      limit: 3,
      source: 'bbl',
    });

    expect(dbResult.chains[0].innerJoin).toHaveBeenCalledTimes(2);
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalledTimes(1);
    expect(dbResult.chains[0].where).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
    expect(dbResult.chains[0].orderBy).toHaveBeenCalled();
  });

  it('rejects an unknown stratum id', async () => {
    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
