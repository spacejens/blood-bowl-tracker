import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';

const row = {
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
};

describe('CharacteristicsChangeStratificationService', () => {
  let service: CharacteristicsChangeStratificationService;
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
        CharacteristicsChangeStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
      ],
    }).compile();
    service = moduleRef.get(CharacteristicsChangeStratificationService);
  });

  it('offers the increased and decreased strata verbatim', () => {
    expect(service.listStrata()).toEqual([
      {
        id: 'characteristic-increased',
        label:
          'Player has a characteristic increased above their position baseline',
        sources: ['bbl', 'tp'],
      },
      {
        id: 'characteristic-decreased',
        label:
          'Player has a characteristic decreased below their position baseline',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('tags each sampled player with the source it was drawn for', async () => {
    const players = await service.sampleStratum({
      stratumId: 'characteristic-increased',
      limit: 3,
      source: 'tp',
    });

    expect(players).toEqual([{ source: 'tp', ...row }]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('tp');
  });

  it('compares all five characteristics for the increased stratum', async () => {
    await service.sampleStratum({
      stratumId: 'characteristic-increased',
      limit: 3,
      source: 'bbl',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered).toContain('move');
    expect(rendered).toContain('strength');
    expect(rendered).toContain('agility');
    expect(rendered).toContain('armour');
    expect(rendered).toContain('passing');
    expect(rendered).toContain('>');
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
    expect(dbResult.chains[0].orderBy).toHaveBeenCalled();
  });

  it('compares all five characteristics for the decreased stratum', async () => {
    await service.sampleStratum({
      stratumId: 'characteristic-decreased',
      limit: 5,
      source: 'bbl',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered).toContain('passing');
    expect(rendered).toContain('<');
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('joins the baseline through the era last-listed rules set', async () => {
    await service.sampleStratum({
      stratumId: 'characteristic-increased',
      limit: 3,
      source: 'bbl',
    });

    expect(dbResult.chains[0].innerJoin).toHaveBeenCalledTimes(2);
    const joins = dbResult.chains[0].innerJoin.mock.calls
      .map((call) => new PgDialect().sqlToQuery(call[1] as SQL).sql)
      .join(' ');
    expect(joins).toContain('era_rules_sets');
    expect(joins.toLowerCase()).toContain('max');
    expect(joins).toContain('position_rules_sets');
  });

  it('rejects an unknown stratum id', async () => {
    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
