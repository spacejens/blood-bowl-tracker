import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { StarPlayerExternalIdsService } from './star-player-external-ids.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<StarPlayerExternalIdsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerExternalIdsService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(StarPlayerExternalIdsService);
}

const ROWS = [
  { systemName: BBL_EXTERNAL_SYSTEM_NAME, externalId: '126-4' },
  { systemName: BBL_EXTERNAL_SYSTEM_NAME, externalId: '126-17' },
  { systemName: TP_EXTERNAL_SYSTEM_NAME, externalId: 'Eldril Sidewinder' },
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
      mockDb([{ systemName: BBL_EXTERNAL_SYSTEM_NAME, externalId: '126' }]),
    );

    expect(await service.bblTypIdsFor(5)).toEqual([]);
  });
});
