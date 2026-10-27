import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { ExternalSystemLookupService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { PlayerStatusStratificationService } from './player-status-stratification.service';

const row = {
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
};

describe('PlayerStatusStratificationService', () => {
  let service: PlayerStatusStratificationService;
  let dbResult: MockDbResult;
  let externalSystems: MockProxy<ExternalSystemLookupService>;
  let query: MockProxy<PlayerProjectionQueryService>;

  beforeEach(async () => {
    dbResult = mockDb([row]);
    externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(9);
    query = mock<PlayerProjectionQueryService>();
    query.base.mockReturnValue(
      dbResult.db.select() as unknown as ReturnType<
        PlayerProjectionQueryService['base']
      >,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerStatusStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
      ],
    }).compile();
    service = moduleRef.get(PlayerStatusStratificationService);
  });

  async function whereFor(stratumId: string) {
    await service.sampleStratum({ source: 'bbl', stratumId, limit: 5 });
    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    return new PgDialect().sqlToQuery(where);
  }

  it('offers six strata, in order, for both sources', () => {
    expect(service.listStrata()).toEqual([
      {
        id: 'status-active-running-era',
        label: 'Active player in a running era',
        sources: ['bbl', 'tp'],
      },
      { id: 'status-dead', label: 'Dead player', sources: ['bbl', 'tp'] },
      { id: 'status-retired', label: 'Retired player', sources: ['bbl', 'tp'] },
      {
        id: 'status-temporarily-retired',
        label: 'Temporarily retired player',
        sources: ['bbl', 'tp'],
      },
      {
        id: 'status-unknown',
        label: 'Player with no reported status',
        sources: ['bbl', 'tp'],
      },
      {
        id: 'status-active-ended-era',
        label: 'Active player in an era that has ended',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it.each([
    ['status-dead', 'dead'],
    ['status-retired', 'retired'],
    ['status-temporarily-retired', 'temporarily_retired'],
  ])('filters %s on players.status = %s alone', async (stratumId, status) => {
    const query = await whereFor(stratumId);

    expect(query.sql).toContain('"players"."status" = $1');
    expect(query.sql).not.toContain('end_date');
    expect(query.params).toEqual([status]);
  });

  it('filters the unknown stratum on a NULL status', async () => {
    const query = await whereFor('status-unknown');

    expect(query.sql).toContain('"players"."status" is null');
    expect(query.params).toEqual([]);
  });

  it('keeps active players whose era has no end date or one not yet passed', async () => {
    const query = await whereFor('status-active-running-era');

    expect(query.params).toEqual(['active']);
    expect(query.sql).toContain('"eras"."end_date" is null');
    expect(query.sql).toContain('"eras"."end_date" >= current_date');
  });

  it('keeps active players whose era end date has passed', async () => {
    const query = await whereFor('status-active-ended-era');

    expect(query.params).toEqual(['active']);
    expect(query.sql).toContain('"eras"."end_date" is not null');
    expect(query.sql).toContain('"eras"."end_date" < current_date');
  });

  it('samples randomly, bounded by the requested limit', async () => {
    await service.sampleStratum({
      source: 'tp',
      stratumId: 'status-dead',
      limit: 5,
    });

    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
    expect(query.base).toHaveBeenCalledWith(9);
    expect(dbResult.chains[0].orderBy).toHaveBeenCalled();
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('tags each sampled row with the source it came from', async () => {
    const players = await service.sampleStratum({
      source: 'tp',
      stratumId: 'status-unknown',
      limit: 5,
    });

    expect(players).toEqual([{ source: 'tp', ...row }]);
  });

  it('rejects an unknown stratum id', async () => {
    await expect(
      service.sampleStratum({ source: 'bbl', stratumId: 'nope', limit: 5 }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
