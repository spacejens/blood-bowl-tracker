import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { RulesSetsService } from './rules-sets.service';

async function makeService(rows: unknown[]) {
  const { db, chains } = mockDb(rows);
  const moduleRef = await Test.createTestingModule({
    providers: [
      RulesSetsService,
      { provide: DB, useValue: db },
      { provide: LikePatternService, useValue: mock<LikePatternService>() },
    ],
  }).compile();
  return { service: moduleRef.get(RulesSetsService), chains };
}

describe('RulesSetsService.resolveBatch', () => {
  it('answers each pair with the rules set id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: 'CRP' },
    ]);

    await expect(
      service.resolveBatch([
        { externalSystemId: 1, externalId: 'CRP' },
        { externalSystemId: 1, externalId: 'nobody' },
      ]),
    ).resolves.toEqual([{ found: true, id: 4 }, { found: false }]);
  });

  it('returns an empty array without querying for an empty request', async () => {
    const { service, chains } = await makeService([]);

    await expect(service.resolveBatch([])).resolves.toEqual([]);
    expect(chains).toHaveLength(0);
  });
});

describe('RulesSetsService.resolve', () => {
  it('answers a single pair with the rules set id that declares it', async () => {
    const { service } = await makeService([
      { ownerId: 4, externalSystemId: 1, externalId: 'CRP' },
    ]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'CRP' }),
    ).resolves.toEqual({ found: true, id: 4 });
  });

  it('reports not found rather than throwing when nothing matches', async () => {
    const { service } = await makeService([]);

    await expect(
      service.resolve({ externalSystemId: 1, externalId: 'ghost' }),
    ).resolves.toEqual({ found: false });
  });
});
