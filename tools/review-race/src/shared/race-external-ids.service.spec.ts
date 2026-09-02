import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { RaceExternalIdsService } from './race-external-ids.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<RaceExternalIdsService> {
  const config = mock<RaceReviewConfigService>();
  config.getExternalSystemName.mockImplementation((source) =>
    source === 'bbl' ? 'tloeg.bbleague.se' : 'tourplay.net',
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceExternalIdsService,
      { provide: DB, useValue: dbResult.db },
      { provide: RaceReviewConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(RaceExternalIdsService);
}

const ROWS = [
  { systemName: 'tloeg.bbleague.se', externalId: '5' },
  { systemName: 'tourplay.net', externalId: 'Dwarf' },
  { systemName: 'tourplay.net', externalId: 'Dwarf_BB2025' },
  { systemName: 'Name', externalId: 'Dwarf Team' },
];

describe('RaceExternalIdsService', () => {
  it("buckets a race's external ids by configured source", async () => {
    const service = await makeService(mockDb(ROWS));

    expect(await service.forRace(7)).toEqual({
      bbl: ['5'],
      tp: ['Dwarf', 'Dwarf_BB2025'],
      name: ['Dwarf Team'],
    });
  });

  it('returns empty buckets for a race with no external ids', async () => {
    const service = await makeService(mockDb([]));

    expect(await service.forRace(7)).toEqual({ bbl: [], tp: [], name: [] });
  });

  it('memoizes per race id', async () => {
    const dbResult = mockDb(ROWS);
    const service = await makeService(dbResult);

    await service.forRace(7);
    await service.forRace(7);

    expect(dbResult.chains).toHaveLength(1);
  });

  it('exposes every id with its system name for the imported panel', async () => {
    const service = await makeService(mockDb(ROWS));

    expect(await service.allForRace(7)).toEqual(ROWS);
  });
});
