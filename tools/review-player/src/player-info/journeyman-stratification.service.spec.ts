import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { ExternalSystemLookupService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { JourneymanStratificationService } from './journeyman-stratification.service';

const row = {
  playerId: 42,
  externalId: '1000',
  playerName: 'Journeyman',
  teamName: 'Reikland Reavers',
  positionName: 'Lineman',
  eraName: 'Fourth Era',
};

describe('JourneymanStratificationService', () => {
  let service: JourneymanStratificationService;
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
        JourneymanStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
      ],
    }).compile();
    service = moduleRef.get(JourneymanStratificationService);
  });

  it('offers one journeyman stratum for both sources', () => {
    expect(service.listStrata()).toEqual([
      { id: 'journeyman', label: 'Journeyman player', sources: ['bbl', 'tp'] },
    ]);
  });

  it('samples players the database marks as journeymen', async () => {
    await service.sampleStratum({
      source: 'bbl',
      stratumId: 'journeyman',
      limit: 5,
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const { sql: rendered, params } = new PgDialect().sqlToQuery(where);
    expect(rendered).toContain('"is_journeyman"');
    // The boolean is bound, so assert the value too: an inverted filter
    // would render the same SQL text.
    expect(params).toEqual([true]);
  });

  it('tags each sampled player with the requested source, within the limit', async () => {
    const players = await service.sampleStratum({
      source: 'tp',
      stratumId: 'journeyman',
      limit: 3,
    });

    expect(players).toEqual([{ source: 'tp', ...row }]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
    expect(query.base).toHaveBeenCalledWith(9);
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
  });

  it('rejects an unknown stratum id', async () => {
    await expect(
      service.sampleStratum({ source: 'bbl', stratumId: 'nope', limit: 3 }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
