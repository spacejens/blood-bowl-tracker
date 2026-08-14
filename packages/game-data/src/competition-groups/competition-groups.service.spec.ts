import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { mockDb } from '../shared/db-mock.test-helpers';
import {
  CompetitionGroupsService,
  CompetitionGroupUpsertConflictError,
} from './competition-groups.service';

async function makeService(...rowsPerQuery: unknown[][]) {
  const db = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [CompetitionGroupsService, { provide: DB, useValue: db.db }],
  }).compile();
  return { service: moduleRef.get(CompetitionGroupsService), db };
}

describe('CompetitionGroupsService', () => {
  it('inserts a new group when no row shares its name', async () => {
    const row = { id: 7, name: 'Chaos Cup', leagueId: 2 };
    const { service } = await makeService([], [row]);

    const result = await service.upsert({ name: 'Chaos Cup', leagueId: 2 });

    expect(result).toEqual({ competitionGroup: row, created: true });
  });

  it('updates the existing row when one shares its name', async () => {
    const existing = { id: 7, name: 'Chaos Cup', leagueId: 2 };
    const updated = { id: 7, name: 'Chaos Cup', leagueId: 3 };
    const { service, db } = await makeService([existing], [updated]);

    const result = await service.upsert({ name: 'Chaos Cup', leagueId: 3 });

    expect(result).toEqual({ competitionGroup: updated, created: false });
    expect(db.chains[1].set).toHaveBeenCalledWith({
      name: 'Chaos Cup',
      leagueId: 3,
    });
  });

  it('throws a conflict error when more than one row shares the name', async () => {
    const { service } = await makeService([{ id: 1 }, { id: 2 }]);

    await expect(
      service.upsert({ name: 'Chaos Cup', leagueId: 2 }),
    ).rejects.toBeInstanceOf(CompetitionGroupUpsertConflictError);
  });

  it('lists every group as an id/name pair', async () => {
    const { service } = await makeService([
      { id: 1, name: 'Major Season' },
      { id: 2, name: 'Chaos Cup' },
    ]);

    await expect(service.listAll()).resolves.toEqual([
      { id: 1, name: 'Major Season' },
      { id: 2, name: 'Chaos Cup' },
    ]);
  });
});
