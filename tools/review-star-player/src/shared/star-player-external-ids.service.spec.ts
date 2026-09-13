import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { StarPlayerExternalIdsService } from './star-player-external-ids.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<StarPlayerExternalIdsService> {
  const config = mock<StarPlayerReviewConfigService>();
  config.getExternalSystemName.mockImplementation((source) =>
    source === 'bbl' ? 'tloeg.bbleague.se' : 'tourplay.net',
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerExternalIdsService,
      { provide: DB, useValue: dbResult.db },
      { provide: StarPlayerReviewConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(StarPlayerExternalIdsService);
}

const ROWS = [
  { systemName: 'tloeg.bbleague.se', externalId: '126-4' },
  { systemName: 'tloeg.bbleague.se', externalId: '126-17' },
  { systemName: 'tourplay.net', externalId: 'Eldril Sidewinder' },
  { systemName: 'Name', externalId: 'Eldril Sidewinder' },
];

describe('StarPlayerExternalIdsService', () => {
  it('returns every external id the star carries', async () => {
    const service = await makeService(mockDb(ROWS));

    expect(await service.allForPosition(5)).toEqual(ROWS);
  });

  it('binds the position id into the query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.allForPosition(5);

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    expect(new PgDialect().sqlToQuery(condition).params).toEqual([5]);
  });

  it('memoizes per position', async () => {
    const dbResult = mockDb(ROWS, []);
    const service = await makeService(dbResult);

    await service.allForPosition(5);
    await service.allForPosition(5);

    expect(dbResult.chains).toHaveLength(1);
  });

  it('buckets the ids by source', async () => {
    const service = await makeService(mockDb(ROWS));

    expect(await service.forPosition(5)).toEqual({
      bbl: ['126-4', '126-17'],
      tp: ['Eldril Sidewinder'],
      name: ['Eldril Sidewinder'],
    });
  });

  it('recovers the BBL typIDs, deduplicated, from the "<typId>-<raceBblId>" ids', async () => {
    const service = await makeService(mockDb(ROWS));

    expect(await service.bblTypIdsFor(5)).toEqual(['126']);
  });

  it('ignores a BBL id with no race half', async () => {
    const service = await makeService(
      mockDb([{ systemName: 'tloeg.bbleague.se', externalId: '126' }]),
    );

    expect(await service.bblTypIdsFor(5)).toEqual([]);
  });
});
