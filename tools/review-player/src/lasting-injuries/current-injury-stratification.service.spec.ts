import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { CurrentInjuryStratificationService } from './current-injury-stratification.service';

const row = {
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
};

describe('CurrentInjuryStratificationService', () => {
  let service: CurrentInjuryStratificationService;
  let dbResult: MockDbResult;
  let externalSystems: MockProxy<ExternalSystemLookupService>;

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
        CurrentInjuryStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
      ],
    }).compile();
    service = moduleRef.get(CurrentInjuryStratificationService);
  });

  it('offers one stratum, for both sources', () => {
    expect(service.listStrata()).toEqual([
      {
        id: 'currently-injured',
        label: 'Player currently has a lasting injury',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('filters on every one of the six columns', async () => {
    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'currently-injured',
      limit: 5,
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    for (const column of [
      'miss_next_game',
      'niggling_injury_count',
      'move_reduction_count',
      'strength_reduction_count',
      'agility_reduction_count',
      'passing_reduction_count',
      'armour_reduction_count',
    ]) {
      expect(rendered).toContain(column);
    }
  });

  it('samples randomly, bounded by the requested limit', async () => {
    await service.sampleStratum({
      source: 'tp',
      stratumId: 'currently-injured',
      limit: 5,
    });

    expect(dbResult.chains[0].orderBy).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('tags each sampled row with the source it came from', async () => {
    const players = await service.sampleStratum({
      source: 'tp',
      stratumId: 'currently-injured',
      limit: 5,
    });

    expect(players).toEqual([{ source: 'tp', ...row }]);
  });

  it('rejects an unknown stratum id', async () => {
    await expect(
      service.sampleStratum({
        source: 'bbl',
        stratumId: 'nope',
        limit: 5,
      }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
