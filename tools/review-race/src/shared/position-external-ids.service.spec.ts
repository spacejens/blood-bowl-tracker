import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PositionExternalIdsService } from './position-external-ids.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<PositionExternalIdsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionExternalIdsService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(PositionExternalIdsService);
}

describe('PositionExternalIdsService', () => {
  it('returns an empty map for an empty input array', async () => {
    const service = await makeService(mockDb([]));

    expect(await service.forPositions([])).toEqual(new Map());
  });

  it('issues no query for an empty input array', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.forPositions([]);

    expect(dbResult.chains).toHaveLength(0);
  });

  it('groups rows into a map keyed by position id', async () => {
    const rows = [
      { positionId: 1, systemName: 'bbl', externalId: 'id1' },
      { positionId: 2, systemName: 'bbl', externalId: 'id2' },
    ];
    const service = await makeService(mockDb(rows));

    const result = await service.forPositions([1, 2]);

    expect(result.get(1)).toEqual([{ systemName: 'bbl', externalId: 'id1' }]);
    expect(result.get(2)).toEqual([{ systemName: 'bbl', externalId: 'id2' }]);
  });

  it('keeps all ids for a position with several', async () => {
    const rows = [
      { positionId: 1, systemName: 'bbl', externalId: 'id1' },
      { positionId: 1, systemName: 'tp', externalId: 'id2' },
    ];
    const service = await makeService(mockDb(rows));

    const result = await service.forPositions([1]);

    expect(result.get(1)).toEqual([
      { systemName: 'bbl', externalId: 'id1' },
      { systemName: 'tp', externalId: 'id2' },
    ]);
  });
});
