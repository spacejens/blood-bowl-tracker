import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { KeywordsService } from './keywords.service';

describe('KeywordsService', () => {
  const keywordRow = {
    id: 7,
    name: 'Goblin',
    kind: 'species' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  async function makeService(...rowsPerQuery: unknown[][]) {
    const db = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [KeywordsService, { provide: DB, useValue: db.db }],
    }).compile();
    return { service: moduleRef.get(KeywordsService), db };
  }

  it('creates a keyword when no external id matches', async () => {
    // query 0: the external-id lookup finds nothing; query 1: the insert
    // returns the row; query 2: the one external id is inserted.
    const { service } = await makeService([], [keywordRow], []);
    const result = await service.upsert({
      name: 'Goblin',
      kind: 'species',
      externalIds: [{ externalSystemId: 1, externalId: '111' }],
    });
    expect(result.created).toBe(true);
    expect(result.keyword).toEqual(keywordRow);
  });

  it('lists the catalogue keyed by one external system', async () => {
    const { service, db } = await makeService([
      { keywordId: 7, name: 'Goblin', kind: 'species', externalId: '111' },
    ]);
    await expect(service.listByExternalSystem(2)).resolves.toEqual([
      { keywordId: 7, name: 'Goblin', kind: 'species', externalId: '111' },
    ]);
    expect(db.db.select).toHaveBeenCalledTimes(1);
  });
});
