import { DB } from '@blood-bowl-tracker/db';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { KeywordsQueriesService } from './keywords-queries.service';

describe('KeywordsQueriesService', () => {
  async function makeService(...rowsPerQuery: unknown[][]) {
    const db = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [KeywordsQueriesService, { provide: DB, useValue: db.db }],
    }).compile();
    return { service: moduleRef.get(KeywordsQueriesService), db };
  }

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
