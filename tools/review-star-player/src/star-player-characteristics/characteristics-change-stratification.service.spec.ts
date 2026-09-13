import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CharacteristicsChangeStratificationService } from './characteristics-change-stratification.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<CharacteristicsChangeStratificationService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CharacteristicsChangeStratificationService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(CharacteristicsChangeStratificationService);
}

describe('CharacteristicsChangeStratificationService', () => {
  it('offers the characteristics-changed stratum verbatim', async () => {
    const service = await makeService(mockDb());

    expect(service.listStrata()).toEqual([
      {
        id: 'characteristics-changed',
        label: "Star player's characteristics changed between rules sets",
        sources: ['bbl', 'tp', 'manual'],
      },
    ]);
  });

  it('returns the sampled star players', async () => {
    const service = await makeService(
      mockDb([{ positionId: 42, positionName: 'Griff Oberwald' }]),
    );

    const stars = await service.sampleStratum({
      stratumId: 'characteristics-changed',
      limit: 3,
      source: 'bbl',
    });

    expect(stars).toEqual([{ positionId: 42, positionName: 'Griff Oberwald' }]);
  });

  it('issues a self-join query comparing all five characteristics and applies limit/order', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.sampleStratum({
      stratumId: 'characteristics-changed',
      limit: 3,
      source: 'bbl',
    });

    const whereCondition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const rendered = new PgDialect().sqlToQuery(whereCondition).sql;
    expect(rendered).toContain('move');
    expect(rendered).toContain('strength');
    expect(rendered).toContain('agility');
    expect(rendered).toContain('armour');
    expect(rendered).toContain('passing');
    expect(rendered.toLowerCase()).toContain('is distinct from');
    expect(rendered).toContain('is_star_player');
    expect(dbResult.chains[0].limit).toHaveBeenCalledWith(3);
    expect(dbResult.chains[0].orderBy).toHaveBeenCalled();
  });

  it('rejects an unknown stratum id', async () => {
    const service = await makeService(mockDb());

    await expect(
      service.sampleStratum({ stratumId: 'nope', limit: 3, source: 'bbl' }),
    ).rejects.toThrow(/Unknown star player stratum "nope"/);
  });
});
