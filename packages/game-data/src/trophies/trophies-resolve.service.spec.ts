import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { TrophiesService } from './trophies.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TrophiesService,
      { provide: DB, useValue: db },
      { provide: LikePatternService, useValue: mock<LikePatternService>() },
    ],
  }).compile();
  return { service: moduleRef.get(TrophiesService), chains };
}

describe('TrophiesService.resolve', () => {
  it('answers a pair with the trophy id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 31, externalSystemId: 1, externalId: '1-Major Season' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '1-Major Season' }),
    ).resolves.toEqual({ found: true, id: 31 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: '9-Nowhere' }),
    ).resolves.toEqual({ found: false });
  });
});
