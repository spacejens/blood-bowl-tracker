import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
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

  it('counts every keyword in the catalogue', async () => {
    const { service } = await makeService([{ count: 48 }]);

    await expect(service.countAll()).resolves.toBe(48);
  });

  it('counts distinct keywords defined under the rules sets an era uses', async () => {
    const { service, db } = await makeService([{ count: 31 }]);

    await expect(service.countByEra(5)).resolves.toBe(31);

    expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(5);
    expect(
      extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 0, 1)),
    ).toEqual([
      'position_rules_sets.id',
      'position_rules_set_keywords.position_rules_set_id',
    ]);
  });

  it('counts distinct keywords across every era of a league', async () => {
    const { service, db } = await makeService([{ count: 44 }]);

    await expect(service.countByLeague(9)).resolves.toBe(44);

    expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(9);
    expect(
      extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 2, 1)),
    ).toEqual(['eras.id', 'era_rules_sets.era_id']);
  });

  it("counts keywords through the competition's own era, filtered by competition id", async () => {
    const { service, db } = await makeService([{ count: 31 }]);

    await expect(service.countByCompetition(7)).resolves.toBe(31);

    expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(7);
    expect(
      extractJoinColumns(firstCallArg(db.chains[0].innerJoin, 2, 1)),
    ).toEqual(['competitions.era_id', 'era_rules_sets.era_id']);
  });
});
