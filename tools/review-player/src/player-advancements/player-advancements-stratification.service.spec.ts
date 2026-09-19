import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import { PlayerAdvancementsStratificationService } from './player-advancements-stratification.service';

const row = {
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
};

describe('PlayerAdvancementsStratificationService', () => {
  let service: PlayerAdvancementsStratificationService;
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
        PlayerAdvancementsStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
        { provide: DB, useValue: dbResult.db },
      ],
    }).compile();
    service = moduleRef.get(PlayerAdvancementsStratificationService);
  });

  it('offers the four advancement strata verbatim, in order', () => {
    expect(service.listStrata()).toEqual([
      {
        id: 'starting-skills-differ-from-position',
        label:
          "Player whose stored starting skills differ from their position's",
        sources: ['bbl', 'tp'],
      },
      {
        id: 'gained-elite-skill',
        label: 'Player gained an elite skill',
        sources: ['bbl', 'tp'],
      },
      {
        id: 'randomly-rolled-skill',
        label: 'Player gained a randomly rolled skill',
        sources: ['bbl', 'tp'],
      },
      {
        id: 'freely-chosen-skill',
        label: 'Player gained a freely chosen skill',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('tags each sampled row with the source it was drawn for', async () => {
    const players = await service.sampleStratum({
      stratumId: 'gained-elite-skill',
      limit: 3,
      source: 'bbl',
    });

    expect(players).toEqual([{ source: 'bbl', ...row }]);
    expect(externalSystems.getSystemId).toHaveBeenCalledWith('bbl');
  });

  it('renders a condition containing is_elite for the elite stratum', async () => {
    await service.sampleStratum({
      stratumId: 'gained-elite-skill',
      limit: 3,
      source: 'bbl',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered).toContain('is_elite');
  });

  it('renders conditions for the random and chosen strata', async () => {
    await service.sampleStratum({
      stratumId: 'randomly-rolled-skill',
      limit: 3,
      source: 'bbl',
    });
    const randomWhere = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const renderedRandom = new PgDialect().sqlToQuery(randomWhere).sql;
    expect(renderedRandom).toContain('random');

    await service.sampleStratum({
      stratumId: 'freely-chosen-skill',
      limit: 3,
      source: 'bbl',
    });
    const chosenWhere = dbResult.chains[0].where.mock.calls[1][0] as SQL;
    const renderedChosen = new PgDialect().sqlToQuery(chosenWhere).sql;
    expect(renderedChosen).toContain('chosen');
  });

  it('renders an array-comparison condition for the differing-starting-skills stratum', async () => {
    await service.sampleStratum({
      stratumId: 'starting-skills-differ-from-position',
      limit: 3,
      source: 'bbl',
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(where).sql;
    expect(rendered).toContain('array_agg');
    expect(rendered.toLowerCase()).toContain('is distinct from');
  });

  it('rejects an unknown stratum id', async () => {
    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown player stratum "nope"/);
  });
});
